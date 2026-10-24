import { createHash } from 'node:crypto';
import { z } from 'zod';
import { itemText } from './checks/index.ts';
import { raceWithTimeout, TimeoutError } from './concurrency.ts';
import type { LLM } from './llm/types.ts';
import { loadPrompt } from './prompts.ts';
import type { BlueprintItem, DimVerdict, Draft, ItemType, JudgeResult, NotRunCause, Passage, Role } from './schema.ts';
import { containsVerbatim } from './text.ts';

/** Bump when a verdict's meaning changes; scores from different versions are not comparable. */
export const JUDGE_VERSION = '1';
export const JUDGE_TIMEOUT_MS = 90_000;

export interface JudgeDim {
  id: string;
  name: string;
  /** A blocking dimension below its threshold sends the item back for a rewrite. */
  blocking: boolean;
  threshold: number;
  appliesTo: ItemType[] | 'all';
  lookFor: string;
  /** The false positives a reviewer keeps raising. They belong in the prompt, not in a post-filter. */
  notADefect: string;
}

export const JUDGE_DIMS: JudgeDim[] = [
  {
    id: 'grounded', name: 'Grounded in the passage', blocking: true, threshold: 0.85, appliesTo: 'all',
    lookFor: 'An answer key the passage does not support or that needs facts from outside it; a source quote that does not prove the answer.',
    notADefect: 'Everyday words and common sense needed to read the question; a correct paraphrase of what the passage says.',
  },
  {
    id: 'single_answer', name: 'Exactly one defensible answer', blocking: true, threshold: 0.9, appliesTo: ['mcq', 'true_false', 'fill_blank'],
    lookFor: 'A wrong option the passage also supports; a true/false statement that is partly true; a blank that several different terms from the passage would fill.',
    notADefect: 'A wrong option that is true in general but not for the question as asked, when the passage makes the difference clear.',
  },
  {
    id: 'clarity', name: 'Clear and self-contained', blocking: false, threshold: 0.8, appliesTo: 'all',
    lookFor: 'Ambiguous wording, a pronoun with nothing to refer to, double negatives, trick phrasing, a question that only makes sense with the passage open.',
    notADefect: 'Technical terms the passage itself uses and explains.',
  },
  {
    id: 'distractors', name: 'Plausible wrong options', blocking: false, threshold: 0.8, appliesTo: ['mcq'],
    lookFor: 'Wrong options nobody who read the passage would pick, joke options, options whose form or length makes the key stand out.',
    notADefect: 'A wrong option that looks wrong only to someone who understood the passage.',
  },
  {
    id: 'difficulty_fit', name: 'Matches the planned difficulty', blocking: false, threshold: 0.75, appliesTo: 'all',
    lookFor: 'A question planned as hard that is answered by matching one word of the passage; one planned as recall that needs inference.',
    notADefect: 'Small differences a teacher would not notice.',
  },
];

export const dimsFor = (type: ItemType): JudgeDim[] => JUDGE_DIMS.filter((d) => d.appliesTo === 'all' || d.appliesTo.includes(type));

// No length limits in the schema: a verdict with a sixth issue or a long quote
// must not be lost to validation. Limits are applied after parsing.
const DimVerdictSchema = z.object({
  applicable: z.boolean().describe('false when this dimension has nothing to grade on this question'),
  score: z.number().describe('0 to 1; 1.0 = no problem; deduct only for a problem you can quote'),
  issues: z.array(z.string()).describe('one short sentence each, most serious first; empty when clean'),
  evidence: z.string().nullable().describe('a verbatim quote under 300 characters showing the worst issue; null when clean'),
});
type RawDim = z.infer<typeof DimVerdictSchema>;

const verdictSchemaFor = (dims: JudgeDim[]) => z.object(Object.fromEntries(dims.map((d) => [d.id, DimVerdictSchema])));

export function rubricHash(dims: JudgeDim[] = JUDGE_DIMS): string {
  return createHash('sha1').update(`${JUDGE_VERSION}\n${renderRubric(dims)}`).digest('hex').slice(0, 10);
}

function renderRubric(dims: JudgeDim[]): string {
  return dims.map((d) => [
    `### ${d.id}: ${d.name}${d.blocking ? ' (blocking)' : ''}, pass at ${d.threshold}`,
    `Look for: ${d.lookFor}`,
    `Not a defect: ${d.notADefect}`,
  ].join('\n')).join('\n\n');
}

export interface JudgeSubject {
  spec: BlueprintItem;
  draft: Draft;
  passage: Passage;
}

function renderSubject(s: JudgeSubject, dims: JudgeDim[]): string {
  return [
    `# Passage ${s.passage.id}${s.passage.heading ? ` (${s.passage.heading})` : ''}`, s.passage.text,
    '', '# Question, exactly as written', JSON.stringify(s.draft, null, 2),
    '', `# Planned: ${s.spec.skill}, ${s.spec.difficulty}. Tests: ${s.spec.focus}`,
    '', '# Rubric: grade every dimension below', renderRubric(dims),
  ].join('\n');
}

/**
 * An issue the judge cannot quote is dropped and the score lifted to the
 * threshold. It is the cheapest defence against a judge that invents
 * problems, and it keeps every reported issue checkable by a human.
 */
export function applyEvidenceRule(raw: RawDim, dim: JudgeDim, body: string): DimVerdict {
  const score = Math.max(0, Math.min(1, Number.isFinite(raw.score) ? raw.score : 0));
  const issues = raw.issues.slice(0, 5).map((i) => String(i).slice(0, 200));
  const evidence = raw.evidence == null ? null : String(raw.evidence).slice(0, 300);
  if (!raw.applicable) return { score: 1, status: 'na', threshold: dim.threshold, pass: null, issues: [], evidence: null };
  const flagged = issues.length > 0 || score < dim.threshold;
  if (flagged && !(evidence && containsVerbatim(body, evidence))) {
    return { score: Math.max(score, dim.threshold), status: 'ok', threshold: dim.threshold, pass: true, issues: [], evidence: null, evidenceDiscarded: true };
  }
  return { score, status: 'ok', threshold: dim.threshold, pass: score >= dim.threshold, issues, evidence };
}

/** The screen found something worth a careful second look. */
export function needsEscalation(dims: Record<string, DimVerdict>): boolean {
  return JUDGE_DIMS.some((d) => {
    const v = dims[d.id];
    if (!v || v.status !== 'ok') return false;
    return d.blocking ? v.score < v.threshold : v.score < v.threshold - 0.1;
  });
}

function notRunResult(cause: NotRunCause, detail: string | undefined, dims: JudgeDim[], tier: 'screen' | 'full'): JudgeResult {
  return {
    status: 'not_run', cause, detail, tier, escalated: false, model: null, failing: [], blockers: [],
    dims: Object.fromEntries(dims.map((d) => [d.id, { score: 0, status: 'not_run' as const, threshold: d.threshold, pass: null, issues: [], evidence: null }])),
  };
}

type CallOutcome = { ok: true; dims: Record<string, DimVerdict>; model: string } | { ok: false; cause: NotRunCause; detail: string };

async function callJudge(llm: LLM, role: Role, s: JudgeSubject, dims: JudgeDim[]): Promise<CallOutcome> {
  try {
    const res = await raceWithTimeout(
      llm.generate({ role, tag: `judge:${s.spec.key}`, system: loadPrompt('judge'), prompt: renderSubject(s, dims), schema: verdictSchemaFor(dims) }),
      JUDGE_TIMEOUT_MS,
      `judge(${s.spec.key})`,
    );
    if (res.refused) return { ok: false, cause: 'refused', detail: 'the judge model declined' };
    if (!res.object) return { ok: false, cause: 'unparseable', detail: `no verdict (stop: ${res.stopReason ?? '?'})` };
    const raw = res.object as Record<string, RawDim>;
    const body = `${itemText(s.draft)}\n${s.passage.text}`;
    const out: Record<string, DimVerdict> = {};
    for (const d of dims) {
      out[d.id] = raw[d.id]
        ? applyEvidenceRule(raw[d.id], d, body)
        : { score: 0, status: 'not_run', threshold: d.threshold, pass: null, issues: [], evidence: null };
    }
    return { ok: true, dims: out, model: res.model };
  } catch (err) {
    const timeout = err instanceof TimeoutError;
    return { ok: false, cause: timeout ? 'timeout' : 'model_error', detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }
}

function finish(dims: Record<string, DimVerdict>, tier: 'screen' | 'full', escalated: boolean, model: string): JudgeResult {
  const failing = Object.entries(dims).filter(([, v]) => v.status === 'ok' && v.pass === false).map(([id]) => id);
  const blocking = new Set(JUDGE_DIMS.filter((d) => d.blocking).map((d) => d.id));
  return { status: 'ok', dims, failing, blockers: failing.filter((id) => blocking.has(id)), tier, escalated, model };
}

/**
 * One call grades every dimension at once; the cheap screen model decides
 * alone unless it finds something, and only then does the strong model look.
 * A judge that could not judge returns not_run, which never counts as a pass.
 */
export async function judgeItem(s: JudgeSubject, llm: LLM, opts: { escalate?: boolean } = {}): Promise<JudgeResult> {
  const dims = dimsFor(s.draft.type);
  const escalate = opts.escalate ?? true;
  if (!llm.available()) return notRunResult('no_model', 'no model credentials', dims, 'screen');

  let first = await callJudge(llm, 'judge_screen', s, dims);
  let retried = false;
  // A screen reply that could not be read says nothing about the question; one careful retry on the full model usually does.
  if (!first.ok && escalate && (first.cause === 'unparseable' || first.cause === 'model_error')) {
    const again = await callJudge(llm, 'judge_full', s, dims);
    if (again.ok) { first = again; retried = true; }
  }
  if (!first.ok) return notRunResult(first.cause, first.detail, dims, retried ? 'full' : 'screen');
  if (retried) return finish(first.dims, 'full', true, first.model);

  if (escalate && needsEscalation(first.dims)) {
    const second = await callJudge(llm, 'judge_full', s, dims);
    // A failed second opinion keeps the screen verdict rather than erasing it.
    if (second.ok) return finish(second.dims, 'full', true, second.model);
  }
  return finish(first.dims, 'screen', false, first.model);
}

/** The reviewer notes a rewrite gets: each failing dimension's issues with the quote that shows them. */
export function reviewerNotes(r: JudgeResult): string[] {
  return r.failing.flatMap((id) => {
    const v = r.dims[id];
    return v.issues.map((i) => (v.evidence ? `${i} (see: "${v.evidence}")` : i));
  });
}
