import type { LLM } from './llm/types.ts';
import { loadPrompt } from './prompts.ts';
import { BlueprintSchema, type Blueprint, type ItemType, type SourceDoc } from './schema.ts';
import { norm, pad2 } from './text.ts';

export interface QuizOptions {
  count: number;
  types: ItemType[];
}

const TYPE_LABEL: Record<ItemType, string> = {
  mcq: 'multiple choice with four options',
  true_false: 'true/false statement',
  fill_blank: 'fill in the blank',
  short_answer: 'short written answer',
};

/** The document as every agent sees it: numbered passages under their headings. */
export function renderDocument(doc: SourceDoc): string {
  return [`# ${doc.title}`, ...doc.passages.map((p) => `[${p.id}]${p.heading ? ` ${p.heading}` : ''}\n${p.text}`)].join('\n\n');
}

function requirements(opts: QuizOptions, doc: SourceDoc): string {
  return [
    `Plan a quiz of exactly ${opts.count} questions about the document above.`,
    `Allowed question types: ${opts.types.map((t) => `${t} (${TYPE_LABEL[t]})`).join('; ')}.`,
    `Number the questions q01, q02, … in the order they should be asked.`,
    `The document has ${doc.passages.length} passages, ${doc.passages[0]?.id} to ${doc.passages.at(-1)?.id}.`,
  ].join('\n');
}

/** Everything wrong with a blueprint that code can see, phrased as instructions the planner can act on. */
export function validateBlueprint(bp: Blueprint, doc: SourceDoc, opts: QuizOptions): string[] {
  const issues: string[] = [];
  const ids = new Set(doc.passages.map((p) => p.id));
  if (bp.items.length !== opts.count) issues.push(`The blueprint has ${bp.items.length} questions; write exactly ${opts.count}.`);

  const unknown = bp.items.filter((i) => !ids.has(i.passageId));
  if (unknown.length) {
    issues.push(`These questions name passages that do not exist: ${unknown.map((i) => `${i.key} → ${i.passageId}`).join(', ')}. Use only ${[...ids].join(', ')}.`);
  }
  const offType = bp.items.filter((i) => !opts.types.includes(i.type));
  if (offType.length) issues.push(`Only these question types are allowed: ${opts.types.join(', ')}. Change ${offType.map((i) => i.key).join(', ')}.`);
  if (opts.count >= opts.types.length) {
    const missing = opts.types.filter((t) => !bp.items.some((i) => i.type === t));
    if (missing.length) issues.push(`Include at least one question of every allowed type; missing: ${missing.join(', ')}.`);
  }

  const cap = Math.max(2, Math.ceil(opts.count / Math.max(1, doc.passages.length)) + 1);
  const perPassage = new Map<string, number>();
  for (const i of bp.items) perPassage.set(i.passageId, (perPassage.get(i.passageId) ?? 0) + 1);
  const crowded = [...perPassage].filter(([, n]) => n > cap);
  if (crowded.length) {
    issues.push(`Spread the questions across the document: ${crowded.map(([p, n]) => `${p} has ${n}`).join(', ')}; use at most ${cap} per passage.`);
  }

  const byFocus = new Map<string, string[]>();
  for (const i of bp.items) byFocus.set(norm(i.focus), [...(byFocus.get(norm(i.focus)) ?? []), i.key]);
  const repeats = [...byFocus.values()].filter((keys) => keys.length > 1);
  if (repeats.length) issues.push(`These questions test the same thing: ${repeats.map((k) => k.join(' and ')).join('; ')}. Give each a different focus.`);

  if (opts.count >= 6 && new Set(bp.items.map((i) => i.difficulty)).size === 1) {
    issues.push('Every question has the same difficulty. Mix easy, medium and hard, with most at medium.');
  }
  return issues;
}

/**
 * What code can fix in a blueprint the planner still got wrong after its
 * retries. A plan that cost a model call is repaired, not thrown away: drop
 * what cannot be answered, collapse repeats, cap the count, renumber.
 */
export function repairBlueprint(bp: Blueprint, doc: SourceDoc, opts: QuizOptions): { blueprint: Blueprint; notes: string[] } {
  const ids = new Set(doc.passages.map((p) => p.id));
  const notes: string[] = [];
  const seen = new Set<string>();
  const kept = bp.items.filter((i) => {
    if (!ids.has(i.passageId)) { notes.push(`dropped ${i.key}: unknown passage ${i.passageId}`); return false; }
    if (!opts.types.includes(i.type)) { notes.push(`dropped ${i.key}: type ${i.type} not requested`); return false; }
    if (seen.has(norm(i.focus))) { notes.push(`dropped ${i.key}: repeats an earlier focus`); return false; }
    seen.add(norm(i.focus));
    return true;
  });
  if (kept.length > opts.count) notes.push(`trimmed ${kept.length - opts.count} extra question(s)`);
  if (kept.length < opts.count) notes.push(`the plan has ${Math.min(kept.length, opts.count)} usable questions of ${opts.count} requested`);
  return { blueprint: renumber({ ...bp, items: kept.slice(0, opts.count) }), notes };
}

const renumber = (bp: Blueprint): Blueprint => ({ ...bp, items: bp.items.map((i, n) => ({ ...i, key: `q${pad2(n + 1)}` })) });

export async function planQuiz(doc: SourceDoc, opts: QuizOptions, llm: LLM, maxAttempts = 2): Promise<{ blueprint: Blueprint; attempts: number; notes: string[] }> {
  const system = loadPrompt('planner');
  const context = renderDocument(doc);
  const base = requirements(opts, doc);
  let feedback = '';
  let last: Blueprint | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = feedback ? `${base}\n\nYour previous blueprint was rejected. Fix exactly this:\n${feedback}` : base;
    const res = await llm.generate({ role: 'planner', tag: 'plan', system, context, prompt, schema: BlueprintSchema });
    if (!res.object) {
      feedback = res.refused ? '- Plan neutral, factual questions about the subject of the document.' : '- Return a complete blueprint.';
      continue;
    }
    last = res.object;
    const issues = validateBlueprint(res.object, doc, opts);
    if (!issues.length) return { blueprint: renumber(res.object), attempts: attempt, notes: [] };
    feedback = issues.map((i) => `- ${i}`).join('\n');
  }
  if (!last) throw new Error('the planner returned no blueprint');
  const { blueprint, notes } = repairBlueprint(last, doc, opts);
  if (!blueprint.items.length) throw new Error('the planner returned no usable questions');
  return { blueprint, attempts: maxAttempts, notes };
}
