import type { Draft } from './types';

export type Response =
  | { type: 'mcq'; choice: number | null }
  | { type: 'true_false'; choice: boolean | null }
  | { type: 'fill_blank'; text: string }
  | { type: 'short_answer'; text: string; selfMark: boolean | null };

export type Result = 'unanswered' | 'self_check' | 'correct' | 'wrong';

const EDGE_PUNCTUATION = /^[\s.,;:!?'"()[\]{}]+|[\s.,;:!?'"()[\]{}]+$/g;

export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B`\u00B4]/g, "'")
    .replace(/[\u201C-\u201F]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(EDGE_PUNCTUATION, '');
}

export function matchesBlank(input: string, answer: string, alternatives: readonly string[] = []): boolean {
  const got = normalizeAnswer(input);
  return got.length > 0 && [answer, ...alternatives].some((a) => normalizeAnswer(a) === got);
}

export function emptyResponse(content: Draft): Response {
  switch (content.type) {
    case 'mcq': return { type: 'mcq', choice: null };
    case 'true_false': return { type: 'true_false', choice: null };
    case 'fill_blank': return { type: 'fill_blank', text: '' };
    case 'short_answer': return { type: 'short_answer', text: '', selfMark: null };
  }
}

export function canCheck(r: Response): boolean {
  switch (r.type) {
    case 'mcq':
    case 'true_false': return r.choice !== null;
    case 'fill_blank': return normalizeAnswer(r.text).length > 0;
    case 'short_answer': return true;
  }
}

/** null means the learner still has to mark a short answer against its rubric. */
export function grade(content: Draft, r: Response): boolean | null {
  if (content.type === 'mcq' && r.type === 'mcq') return r.choice !== null && content.options[r.choice] === content.answer;
  if (content.type === 'true_false' && r.type === 'true_false') return r.choice === content.answer;
  if (content.type === 'fill_blank' && r.type === 'fill_blank') return matchesBlank(r.text, content.answer, content.alternatives);
  if (content.type === 'short_answer' && r.type === 'short_answer') return r.selfMark;
  throw new Error(`response type ${r.type} does not fit a ${content.type} item`);
}

export function resultOf(content: Draft, r: Response, checked: boolean): Result {
  if (!checked) return 'unanswered';
  const g = grade(content, r);
  return g === null ? 'self_check' : g ? 'correct' : 'wrong';
}

export interface Score {
  correct: number;
  done: number;
  total: number;
}

export function score(results: readonly Result[]): Score {
  return {
    correct: results.filter((r) => r === 'correct').length,
    done: results.filter((r) => r === 'correct' || r === 'wrong').length,
    total: results.length,
  };
}
