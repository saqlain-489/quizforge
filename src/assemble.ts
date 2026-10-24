import type { McqDraft } from './schema.ts';

/**
 * Which slot the correct option moves to, derived from the question text.
 * Writers put the key first far more often than chance: each item is written
 * alone and models reach for the same shape every time. Deterministic, so a
 * re-run lands the key in the same place, and testable without a model.
 */
export function answerSlotFor(seed: string, optionCount: number): number {
  const n = Math.max(1, Math.trunc(optionCount));
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % n;
}

/**
 * The options re-ordered so the one at `from` ends up at `to`. A rotation, not
 * a shuffle: it is idempotent (a second pass finds the key already in place)
 * and each option keeps its neighbours.
 */
export function rotateOptionsTo<T>(options: readonly T[], from: number, to: number): T[] {
  const n = options.length;
  if (n === 0) return [];
  const shift = (((from - to) % n) + n) % n;
  return options.map((_, i) => options[(i + shift) % n]);
}

export function balanceAnswerPosition(d: McqDraft): McqDraft {
  const key = d.options.indexOf(d.answer);
  if (key < 0 || d.options.length < 3) return d;
  const target = answerSlotFor(d.question, d.options.length);
  return target === key ? d : { ...d, options: rotateOptionsTo(d.options, key, target) };
}
