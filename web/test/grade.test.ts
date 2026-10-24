import { describe, expect, it } from 'vitest';
import { canCheck, emptyResponse, grade, matchesBlank, normalizeAnswer, resultOf, score } from '@/lib/grade';
import type { Draft } from '@/lib/types';

const blank: Draft = {
  type: 'fill_blank',
  sentence: 'The cache sends the ETag back in the ____ request header.',
  answer: 'If-None-Match',
  alternatives: ['If None Match header'],
  explanation: '',
  sourceQuote: '',
};

const mcq: Draft = {
  type: 'mcq',
  question: 'What does the server send when nothing changed?',
  options: ['200 OK', '304 Not Modified', '404 Not Found', '412 Precondition Failed'],
  answer: '304 Not Modified',
  explanation: '',
  sourceQuote: '',
};

const tf: Draft = { type: 'true_false', statement: 'no-cache forbids storing.', answer: false, explanation: '', sourceQuote: '' };

const short: Draft = { type: 'short_answer', question: 'Why?', modelAnswer: 'Because.', rubric: ['a', 'b'], sourceQuote: '' };

describe('normalizeAnswer', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(normalizeAnswer('  If-None-MATCH \n')).toBe('if-none-match');
  });

  it('strips punctuation and quotes around the answer but keeps it inside', () => {
    expect(normalizeAnswer('"If-None-Match."')).toBe('if-none-match');
    expect(normalizeAnswer('(max-age=60);')).toBe('max-age=60');
    expect(normalizeAnswer('e.g.')).toBe('e.g');
  });

  it('folds curly quotes, unicode dashes and repeated spaces', () => {
    expect(normalizeAnswer('“no‑cache”')).toBe('no-cache');
    expect(normalizeAnswer('stale  while\trevalidate')).toBe('stale while revalidate');
    expect(normalizeAnswer('ＥＴａｇ')).toBe('etag');
  });

  it('keeps symbols that change the meaning', () => {
    expect(normalizeAnswer('C++')).toBe('c++');
    expect(normalizeAnswer('#hash')).toBe('#hash');
  });
});

describe('matchesBlank', () => {
  it('accepts the answer however it is cased or punctuated', () => {
    for (const input of ['If-None-Match', 'if-none-match', ' IF-NONE-MATCH ', 'If-None-Match.', '“If-None-Match”']) {
      expect(matchesBlank(input, 'If-None-Match')).toBe(true);
    }
  });

  it('accepts listed alternatives', () => {
    expect(matchesBlank('if none match header', 'If-None-Match', ['If None Match header'])).toBe(true);
  });

  it('rejects other words, partial answers and empty input', () => {
    expect(matchesBlank('If-Modified-Since', 'If-None-Match')).toBe(false);
    expect(matchesBlank('None-Match', 'If-None-Match')).toBe(false);
    expect(matchesBlank('If-None-Match header', 'If-None-Match')).toBe(false);
    expect(matchesBlank('', 'If-None-Match')).toBe(false);
    expect(matchesBlank(' ?! ', '')).toBe(false);
  });
});

describe('grade', () => {
  it('grades multiple choice by the chosen option', () => {
    expect(grade(mcq, { type: 'mcq', choice: 1 })).toBe(true);
    expect(grade(mcq, { type: 'mcq', choice: 0 })).toBe(false);
    expect(grade(mcq, { type: 'mcq', choice: null })).toBe(false);
  });

  it('grades true/false, including a false key', () => {
    expect(grade(tf, { type: 'true_false', choice: false })).toBe(true);
    expect(grade(tf, { type: 'true_false', choice: true })).toBe(false);
  });

  it('grades fill-in-the-blank forgivingly', () => {
    expect(grade(blank, { type: 'fill_blank', text: 'if-none-match ' })).toBe(true);
    expect(grade(blank, { type: 'fill_blank', text: 'ETag' })).toBe(false);
  });

  it('leaves a short answer to the learner until they mark it', () => {
    expect(grade(short, { type: 'short_answer', text: 'anything', selfMark: null })).toBeNull();
    expect(grade(short, { type: 'short_answer', text: '', selfMark: true })).toBe(true);
    expect(grade(short, { type: 'short_answer', text: '', selfMark: false })).toBe(false);
  });

  it('refuses a response of the wrong type', () => {
    expect(() => grade(mcq, { type: 'true_false', choice: true })).toThrow(/does not fit/);
  });
});

describe('canCheck and resultOf', () => {
  it('needs a choice or some text before checking, except for short answers', () => {
    expect(canCheck(emptyResponse(mcq))).toBe(false);
    expect(canCheck(emptyResponse(tf))).toBe(false);
    expect(canCheck({ type: 'true_false', choice: false })).toBe(true);
    expect(canCheck({ type: 'fill_blank', text: ' . ' })).toBe(false);
    expect(canCheck({ type: 'fill_blank', text: 'x' })).toBe(true);
    expect(canCheck(emptyResponse(short))).toBe(true);
  });

  it('reports unanswered, self-check, correct and wrong', () => {
    expect(resultOf(mcq, { type: 'mcq', choice: 1 }, false)).toBe('unanswered');
    expect(resultOf(mcq, { type: 'mcq', choice: 1 }, true)).toBe('correct');
    expect(resultOf(mcq, { type: 'mcq', choice: 2 }, true)).toBe('wrong');
    expect(resultOf(short, { type: 'short_answer', text: '', selfMark: null }, true)).toBe('self_check');
  });
});

describe('score', () => {
  it('counts correct answers out of every question', () => {
    expect(score(['correct', 'wrong', 'self_check', 'unanswered', 'correct'])).toEqual({ correct: 2, done: 3, total: 5 });
    expect(score([])).toEqual({ correct: 0, done: 0, total: 0 });
  });
});
