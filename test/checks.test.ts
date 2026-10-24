import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkItem, findMcqBalanceDefect } from '../src/checks/index.ts';
import type { Draft } from '../src/schema.ts';
import { GOOD_MCQ, PASSAGE } from './helpers.ts';

const codes = (d: Draft) => checkItem(d, PASSAGE).map((x) => x.code);
const mcq = (over: Partial<typeof GOOD_MCQ> = {}): Draft => ({ type: 'mcq', ...GOOD_MCQ, ...over });

test('a well-formed multiple-choice item passes every check', () => {
  assert.deepEqual(codes(mcq()), []);
});

test('a paraphrased source quote is refused; quote, dash and case differences are not', () => {
  const para = checkItem(mcq({ sourceQuote: 'If nothing changed, the server answers 304 Not Modified without a body.' }), PASSAGE);
  assert.equal(para[0]?.code, 'quote_not_in_passage');
  assert.equal(para[0]?.refuse, true);
  assert.deepEqual(codes(mcq({ sourceQuote: 'WHEN NOTHING HAS CHANGED,   the server replies with 304 Not Modified and no body.' })), []);
});

test('the key may not be the visibly longest option, but near misses pass', () => {
  const long = ['It sets a lifetime that overrides max-age, but only for shared caches such as CDNs', 'It doubles max-age', 'It disables caching', 'It sets minutes'];
  assert.equal(findMcqBalanceDefect(long, long[0])?.code, 'mcq_key_is_longest');
  const close = ['It overrides max-age for shared caches only', 'It overrides max-age for browsers', 'It doubles max-age everywhere', 'It sets the lifetime in minutes'];
  assert.equal(findMcqBalanceDefect(close, close[0]), null);
});

test('option count, duplicates and an answer that is not an option are refused', () => {
  assert.ok(codes(mcq({ options: GOOD_MCQ.options.slice(0, 3) })).includes('mcq_option_count'));
  assert.ok(codes(mcq({ options: ['304 Not Modified with no body', '304 not modified with no body', 'a', 'b'] })).includes('mcq_duplicate_options'));
  assert.ok(codes(mcq({ answer: '304 Not Modified' })).includes('mcq_answer_not_an_option'));
});

test('all/none of the above, answer leaks and unmarked negatives are flagged', () => {
  assert.ok(codes(mcq({ options: [...GOOD_MCQ.options.slice(0, 3), 'All of the above'] })).includes('mcq_all_or_none_of_the_above'));
  assert.ok(codes(mcq({ question: 'Is "304 Not Modified with no body" what the server sends when nothing changed?' })).includes('answer_in_stem'));
  assert.ok(codes(mcq({ question: 'Which status does the server not send when nothing changed?' })).includes('negative_stem_unmarked'));
  assert.ok(!codes(mcq({ question: 'Which status does the server NOT send when nothing changed?' })).includes('negative_stem_unmarked'));
});

test('true/false: a question is refused, absolute words are flagged', () => {
  const tf = (statement: string): Draft => ({ type: 'true_false', statement, answer: true, explanation: 'x', sourceQuote: GOOD_MCQ.sourceQuote });
  assert.ok(codes(tf('Does the server send 304 when nothing changed?')).includes('tf_is_a_question'));
  assert.ok(codes(tf('The server always sends 304 when nothing changed.')).includes('tf_absolute_word'));
  assert.deepEqual(codes(tf('The server sends 304 Not Modified when the resource is unchanged.')), []);
});

test('fill in the blank: exactly one blank, answer not visible, short answer', () => {
  const fb = (sentence: string, answer = '304 Not Modified'): Draft => ({ type: 'fill_blank', sentence, answer, alternatives: [], explanation: 'x', sourceQuote: GOOD_MCQ.sourceQuote });
  assert.deepEqual(codes(fb('When nothing has changed, the server replies with ____ and no body.')), []);
  assert.ok(codes(fb('The server replies with ____ or ____.')).includes('blank_count'));
  assert.ok(codes(fb('The server replies with ____, which is 304 Not Modified.')).includes('blank_answer_visible'));
  assert.ok(codes(fb('The server replies with ____.', '304 Not Modified and no body at all')).includes('blank_answer_too_long'));
});

test('short answer: rubric must have two to four points', () => {
  const sa = (rubric: string[]): Draft => ({ type: 'short_answer', question: 'What happens when nothing changed?', modelAnswer: 'A 304 with no body.', rubric, sourceQuote: GOOD_MCQ.sourceQuote });
  assert.ok(codes(sa(['one'])).includes('rubric_size'));
  assert.deepEqual(codes(sa(['mentions 304', 'mentions no body'])), []);
});

test('meta language about the passage or the AI is flagged', () => {
  assert.ok(codes(mcq({ question: 'According to the provided passage, what does the server send back when nothing changed?' })).includes('meta_language'));
});
