import { describe, expect, it } from 'vitest';
import { initQuiz, quizReducer, resultsOf, type QuizState } from '@/lib/quiz-state';
import type { Item } from '@/lib/types';

const meta = { passageId: 'p01', skill: 'recall', difficulty: 'easy', focus: 'f', judge: null } as const;
const generation = { rounds: 1, model: null, fixed: [], warnings: [], revisedAfterJudge: false };
const items: Item[] = [
  { ...meta, key: 'q01', generation, content: { type: 'mcq', question: 'Q?', options: ['a', 'b', 'c', 'd'], answer: 'b', explanation: '', sourceQuote: '' } },
  { ...meta, key: 'q02', generation, content: { type: 'fill_blank', sentence: 'x ____ y', answer: 'Etag', alternatives: [], explanation: '', sourceQuote: '' } },
  { ...meta, key: 'q03', generation, content: { type: 'short_answer', question: 'Why?', modelAnswer: 'm', rubric: ['r1', 'r2'], sourceQuote: '' } },
];

const run = (...actions: Parameters<typeof quizReducer>[1][]): QuizState => actions.reduce(quizReducer, initQuiz(items));

describe('quizReducer', () => {
  it('starts on the first question with empty answers', () => {
    const s = initQuiz(items);
    expect(s.current).toBe(0);
    expect(s.items.map((i) => i.response)).toEqual([
      { type: 'mcq', choice: null },
      { type: 'fill_blank', text: '' },
      { type: 'short_answer', text: '', selfMark: null },
    ]);
    expect(resultsOf(items, s)).toEqual(['unanswered', 'unanswered', 'unanswered']);
  });

  it('will not check a question that has no answer yet', () => {
    expect(run({ type: 'check', index: 0 }).items[0]?.checked).toBe(false);
  });

  it('grades a checked answer and freezes it', () => {
    const s = run(
      { type: 'respond', index: 0, response: { type: 'mcq', choice: 1 } },
      { type: 'check', index: 0 },
      { type: 'respond', index: 0, response: { type: 'mcq', choice: 2 } },
    );
    expect(s.items[0]?.response).toEqual({ type: 'mcq', choice: 1 });
    expect(resultsOf(items, s)[0]).toBe('correct');
  });

  it('counts a short answer only once the learner marks it', () => {
    const shown = run({ type: 'self_mark', index: 2, correct: true }, { type: 'check', index: 2 });
    expect(resultsOf(items, shown)[2]).toBe('self_check');
    expect(resultsOf(items, quizReducer(shown, { type: 'self_mark', index: 2, correct: false }))[2]).toBe('wrong');
    expect(resultsOf(items, quizReducer(shown, { type: 'self_mark', index: 2, correct: true }))[2]).toBe('correct');
  });

  it('moves between questions and the score screen, never past it', () => {
    expect(run({ type: 'go', index: 2 }).current).toBe(2);
    expect(run({ type: 'go', index: 99 }).current).toBe(items.length);
    expect(run({ type: 'go', index: -4 }).current).toBe(0);
  });

  it('ignores answers for questions that do not exist', () => {
    const s = initQuiz(items);
    expect(quizReducer(s, { type: 'respond', index: 7, response: { type: 'mcq', choice: 0 } })).toBe(s);
  });

  it('restarts from scratch', () => {
    const s = run(
      { type: 'respond', index: 1, response: { type: 'fill_blank', text: 'etag' } },
      { type: 'check', index: 1 },
      { type: 'go', index: 3 },
      { type: 'restart', items },
    );
    expect(s).toEqual(initQuiz(items));
  });
});
