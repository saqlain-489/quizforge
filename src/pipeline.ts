import { randomUUID } from 'node:crypto';
import { balanceAnswerPosition } from './assemble.ts';
import { mapLimit } from './concurrency.ts';
import { judgeItem, reviewerNotes } from './judge.ts';
import type { CallLog, LLM } from './llm/types.ts';
import { planQuiz, type QuizOptions } from './plan.ts';
import type { Blueprint, BlueprintItem, CallRecord, Item, JudgeResult, QuizRun, RunReport, SourceDoc } from './schema.ts';
import { writeItem } from './write.ts';

export interface PipelineDeps {
  llm: LLM;
  log: CallLog;
  concurrency?: number;
  maxRounds?: number;
  judge?: boolean;
  onEvent?: (e: PipelineEvent) => void;
}

export type PipelineEvent =
  | { type: 'plan'; items: number; attempts: number; notes: string[] }
  | { type: 'item'; key: string; status: 'ok' | 'fixed' | 'revised' | 'dropped'; detail: string };

export interface ProduceOutcome {
  item: Item | null;
  dropped?: { key: string; reason: string };
}

/** Write → check → judge → (one rewrite if a blocking dimension failed) → judge again. */
export async function produceItem(spec: BlueprintItem, doc: SourceDoc, deps: PipelineDeps): Promise<ProduceOutcome> {
  const passage = doc.passages.find((p) => p.id === spec.passageId);
  const w = await writeItem({ spec, doc, llm: deps.llm, maxRounds: deps.maxRounds ?? 3 });
  if (!w.draft || !passage) return { item: null, dropped: { key: spec.key, reason: w.gapReason ?? 'not written' } };

  let draft = w.draft;
  let generation: Item['generation'] = { rounds: w.rounds, model: w.model, fixed: w.fixed, warnings: w.warnings, revisedAfterJudge: false };
  let verdict: JudgeResult | null = null;

  if (deps.judge !== false) {
    verdict = await judgeItem({ spec, draft, passage }, deps.llm);
    if (verdict.status === 'ok' && verdict.blockers.length) {
      const rw = await writeItem({ spec, doc, llm: deps.llm, maxRounds: 2, reviewerNotes: reviewerNotes(verdict), tagSuffix: ':rev' });
      if (!rw.draft) {
        return { item: null, dropped: { key: spec.key, reason: `failed review (${verdict.blockers.join(', ')}); rewrite failed: ${rw.gapReason}` } };
      }
      const second = await judgeItem({ spec, draft: rw.draft, passage }, deps.llm);
      if (second.status === 'ok' && second.blockers.length) {
        return { item: null, dropped: { key: spec.key, reason: `failed review twice: ${second.blockers.join(', ')}` } };
      }
      draft = rw.draft;
      verdict = second;
      generation = {
        rounds: w.rounds + rw.rounds, model: rw.model, fixed: [...new Set([...w.fixed, ...rw.fixed])],
        warnings: rw.warnings, revisedAfterJudge: true,
      };
    }
  }
  if (draft.type === 'mcq') draft = { type: 'mcq', ...balanceAnswerPosition(draft) };
  return {
    item: { key: spec.key, passageId: spec.passageId, skill: spec.skill, difficulty: spec.difficulty, focus: spec.focus, content: draft, generation, judge: verdict },
  };
}

function describe(o: ProduceOutcome): PipelineEvent {
  if (!o.item) return { type: 'item', key: o.dropped?.key ?? '?', status: 'dropped', detail: o.dropped?.reason ?? '' };
  const g = o.item.generation;
  const j = o.item.judge;
  const judged = !j ? 'not judged' : j.status === 'not_run' ? `judge not run (${j.cause})` : `judge ${j.tier}${j.escalated ? ', escalated' : ''}`;
  if (g.revisedAfterJudge) return { type: 'item', key: o.item.key, status: 'revised', detail: `rewritten after review · ${judged}` };
  if (g.fixed.length) return { type: 'item', key: o.item.key, status: 'fixed', detail: `fixed ${g.fixed.join(', ')} in ${g.rounds} rounds · ${judged}` };
  return { type: 'item', key: o.item.key, status: 'ok', detail: `round ${g.rounds} · ${judged}` };
}

/** Every item, with the first run alone so the cached document prefix exists before the fan-out. */
export async function produceAll(blueprint: Blueprint, doc: SourceDoc, deps: PipelineDeps): Promise<ProduceOutcome[]> {
  const run = async (spec: BlueprintItem) => {
    const o = await produceItem(spec, doc, deps);
    deps.onEvent?.(describe(o));
    return o;
  };
  const [first, ...rest] = blueprint.items;
  if (!first) return [];
  return [await run(first), ...(await mapLimit(rest, deps.concurrency ?? 4, run))];
}

export function buildReport(args: {
  mode: 'live' | 'replay';
  startedAt: Date;
  doc: SourceDoc;
  planned: number;
  outcomes: ProduceOutcome[];
  calls: CallRecord[];
  notes: string[];
}): RunReport {
  const items = args.outcomes.flatMap((o) => (o.item ? [o.item] : []));
  const defectsCaught: Record<string, number> = {};
  for (const i of items) for (const c of i.generation.fixed) defectsCaught[c] = (defectsCaught[c] ?? 0) + 1;
  const graded = items.filter((i) => i.judge?.status === 'ok');
  const byRole: RunReport['byRole'] = {};
  for (const c of args.calls) {
    const r = (byRole[c.role] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    r.calls++;
    r.inputTokens += c.inputTokens + c.cacheReadTokens + c.cacheWriteTokens;
    r.outputTokens += c.outputTokens;
    r.costUsd = Math.round((r.costUsd + c.costUsd) * 1e6) / 1e6;
  }
  const tf = items.filter((i) => i.content.type === 'true_false').map((i) => (i.content.type === 'true_false' ? i.content.answer : null));
  const warnings = [
    ...args.notes,
    ...items.flatMap((i) => i.generation.warnings.map((w) => `${i.key}: ${w}`)),
    ...(tf.length >= 3 && new Set(tf).size === 1 ? [`every true/false answer is ${tf[0]}; a test-wise learner scores full marks by guessing`] : []),
  ];
  return {
    runId: `${args.mode}-${randomUUID().slice(0, 8)}`,
    mode: args.mode,
    startedAt: args.startedAt.toISOString(),
    ms: Date.now() - args.startedAt.getTime(),
    source: { title: args.doc.title, origin: args.doc.origin, words: args.doc.words, passages: args.doc.passages.length },
    planned: args.planned,
    delivered: items.length,
    dropped: args.outcomes.flatMap((o) => (o.dropped ? [o.dropped] : [])),
    firstTry: items.filter((i) => i.generation.rounds === 1 && !i.generation.revisedAfterJudge).length,
    fixedByRetry: items.filter((i) => i.generation.fixed.length > 0).length,
    revisedAfterJudge: items.filter((i) => i.generation.revisedAfterJudge).length,
    defectsCaught,
    judge: {
      graded: graded.length,
      escalations: args.calls.filter((c) => c.role === 'judge_full' && c.ok).length,
      notRun: items.filter((i) => i.judge?.status === 'not_run').length,
      passed: graded.filter((i) => !i.judge?.blockers.length).length,
    },
    byRole,
    costUsd: Math.round(args.calls.reduce((s, c) => s + c.costUsd, 0) * 1e6) / 1e6,
    warnings,
  };
}

export async function runPipeline(doc: SourceDoc, opts: QuizOptions, deps: PipelineDeps): Promise<QuizRun> {
  const startedAt = new Date();
  const plan = await planQuiz(doc, opts, deps.llm);
  deps.onEvent?.({ type: 'plan', items: plan.blueprint.items.length, attempts: plan.attempts, notes: plan.notes });
  const outcomes = await produceAll(plan.blueprint, doc, deps);
  const report = buildReport({
    mode: deps.llm.mode, startedAt, doc, planned: plan.blueprint.items.length, outcomes, calls: deps.log.calls, notes: plan.notes,
  });
  return { quiz: { title: plan.blueprint.title, items: outcomes.flatMap((o) => (o.item ? [o.item] : [])) }, source: doc, report };
}
