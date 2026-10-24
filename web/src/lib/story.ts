import type { DimVerdict, Draft, Item, ItemType, Role, TraceEvent } from './types';

export const TYPE_LABEL: Record<ItemType, string> = {
  mcq: 'Multiple choice',
  true_false: 'True or false',
  fill_blank: 'Fill in the blank',
  short_answer: 'Short answer',
};

export const ROLE_LABEL: Record<Role, string> = {
  planner: 'Planner',
  writer: 'Writer',
  writer_strong: 'Strong writer',
  judge_screen: 'Screen judge',
  judge_full: 'Strong judge',
};

export type Badge = 'first_try' | 'retried' | 'fixed' | 'rewritten' | 'discarded';

export const BADGE_LABEL: Record<Badge, string> = {
  first_try: 'First try',
  retried: 'Passed on a retry',
  fixed: 'Fixed by a retry',
  rewritten: 'Rewritten after the judge',
  discarded: 'Unquoted complaint discarded',
};

export function badgesFor(item: Item, events: readonly TraceEvent[]): Badge[] {
  const g = item.generation;
  const out: Badge[] = [];
  if (g.revisedAfterJudge) out.push('rewritten');
  if (g.fixed.length) out.push('fixed');
  if (!out.length) out.push(g.rounds === 1 ? 'first_try' : 'retried');
  const discarded = events.some((e) => e.kind === 'judge' && e.discarded.length > 0)
    || Object.values(item.judge?.dims ?? {}).some((d) => d.evidenceDiscarded);
  if (discarded) out.push('discarded');
  return out;
}

export const humanize = (id: string): string => {
  const words = id.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const fmtScore = (n: number): string => n.toFixed(2);

export type DimTone = 'pass' | 'fail' | 'warn' | 'none';

export function dimTone(v: DimVerdict, blocking: boolean): DimTone {
  if (v.status !== 'ok' || v.pass === null) return 'none';
  if (v.pass) return 'pass';
  return blocking ? 'fail' : 'warn';
}

export function stemOf(d: Draft): string {
  switch (d.type) {
    case 'mcq':
    case 'short_answer': return d.question;
    case 'true_false': return d.statement;
    case 'fill_blank': return d.sentence;
  }
}
