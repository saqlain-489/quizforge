import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEvidenceRule, JUDGE_DIMS, judgeItem } from '../src/judge.ts';
import { replayLLM } from '../src/llm/replay.ts';
import { CallLog, type GenerateArgs, type LLM } from '../src/llm/types.ts';
import { repairBlueprint, validateBlueprint } from '../src/plan.ts';
import type { Draft } from '../src/schema.ts';
import { writeItem } from '../src/write.ts';
import { clean, cleanVerdict, DOC, GOOD_MCQ, PASSAGE, SPEC } from './helpers.ts';

function recording(llm: LLM, prompts: string[]): LLM {
  return { ...llm, generate: <T>(a: GenerateArgs<T>) => { prompts.push(a.prompt); return llm.generate(a); } };
}

const LONG_KEY = {
  ...GOOD_MCQ,
  options: ['304 Not Modified with no body, which tells the cache that its stored copy is still valid', '200 OK', '404', '412'],
  answer: '304 Not Modified with no body, which tells the cache that its stored copy is still valid',
};

test('writer: a defect is retried with the checker\'s exact words, then the fix is recorded', async () => {
  const log = new CallLog();
  const prompts: string[] = [];
  const llm = replayLLM({ 'writer|write:q01': [{ object: LONG_KEY }, { object: GOOD_MCQ }] }, log);
  const out = await writeItem({ spec: SPEC, doc: DOC, llm: recording(llm, prompts) });
  assert.equal(out.rounds, 2);
  assert.deepEqual(out.fixed, ['mcq_key_is_longest']);
  assert.match(prompts[1], /REJECTED by the checker/);
  assert.match(prompts[1], /correct option is .*x as long as the wrong ones/);
});

test('writer: the final round goes to the strong model, and a refusing defect drops the item', async () => {
  const bad = { ...GOOD_MCQ, sourceQuote: 'Something the passage never says.' };
  const llm = replayLLM({ 'writer|write:q01': [{ object: bad }, { object: bad }], 'writer_strong|write:q01': [{ object: bad }] });
  const out = await writeItem({ spec: SPEC, doc: DOC, llm });
  assert.equal(out.draft, null);
  assert.match(out.gapReason ?? '', /refused after 3 rounds: quote_not_in_passage/);
  assert.deepEqual(llm.remaining(), []);
});

test('writer: a policy decline asks for new wording; a mild defect on the last round ships as a warning', async () => {
  const prompts: string[] = [];
  const llm = replayLLM({ 'writer|write:q01': [{ refuse: true }], 'writer_strong|write:q01': [{ object: LONG_KEY }] });
  const out = await writeItem({ spec: SPEC, doc: DOC, llm: recording(llm, prompts), maxRounds: 2 });
  assert.match(prompts[1], /declined by a safety filter/);
  assert.ok(out.draft);
  assert.equal(out.warnings.length, 1);
});

test('judge: an issue without a verbatim quote is discarded', () => {
  const dim = JUDGE_DIMS.find((d) => d.id === 'clarity')!;
  const body = 'A file named with a hash can be cached for a year.';
  const invented = applyEvidenceRule({ applicable: true, score: 0.5, issues: ['vague'], evidence: 'something else entirely' }, dim, body);
  assert.equal(invented.pass, true);
  assert.equal(invented.evidenceDiscarded, true);
  const quoted = applyEvidenceRule({ applicable: true, score: 0.5, issues: ['vague'], evidence: 'cached for a year' }, dim, body);
  assert.equal(quoted.pass, false);
});

test('judge: a flagged blocker escalates to the strong model, whose verdict stands', async () => {
  const flagged = { ...cleanVerdict, single_answer: { applicable: true, score: 0.4, issues: ['two answers'], evidence: '200 OK with the full content' } };
  const llm = replayLLM({ 'judge_screen|judge:q01': [{ object: flagged }], 'judge_full|judge:q01': [{ object: flagged }] });
  const r = await judgeItem({ spec: SPEC, draft: { type: 'mcq', ...GOOD_MCQ }, passage: PASSAGE }, llm);
  assert.equal(r.tier, 'full');
  assert.equal(r.escalated, true);
  assert.deepEqual(r.blockers, ['single_answer']);
});

test('judge: an unreadable screen reply is retried on the full model; no model means not_run, never a pass', async () => {
  const llm = replayLLM({ 'judge_screen|judge:q01': [{ fail: 'socket hang up' }], 'judge_full|judge:q01': [{ object: cleanVerdict }] });
  const r = await judgeItem({ spec: SPEC, draft: { type: 'mcq', ...GOOD_MCQ }, passage: PASSAGE }, llm);
  assert.equal(r.status, 'ok');
  assert.equal(r.tier, 'full');

  const none = { ...replayLLM({}), available: () => false };
  const nr = await judgeItem({ spec: SPEC, draft: { type: 'mcq', ...GOOD_MCQ }, passage: PASSAGE }, none);
  assert.equal(nr.status, 'not_run');
  assert.ok(Object.values(nr.dims).every((d) => d.pass === null));
});

test('judge: only the dimensions that apply to the item type are asked for', async () => {
  const draft: Draft = { type: 'short_answer', question: 'What happens when nothing changed?', modelAnswer: 'A 304.', rubric: ['304', 'no body'], sourceQuote: GOOD_MCQ.sourceQuote };
  const llm = replayLLM({ 'judge_screen|judge:q01': [{ object: { grounded: clean(), clarity: clean(), difficulty_fit: clean() } }] });
  const r = await judgeItem({ spec: { ...SPEC, type: 'short_answer' }, draft, passage: PASSAGE }, llm);
  assert.deepEqual(Object.keys(r.dims).sort(), ['clarity', 'difficulty_fit', 'grounded']);
});

test('planner: invalid blueprints get instructions; leftovers are repaired, not discarded', () => {
  const doc = { ...DOC, passages: [PASSAGE, { ...PASSAGE, id: 'p02' }] };
  const item = (key: string, passageId: string, focus: string) => ({ ...SPEC, key, passageId, focus });
  const bp = { title: 't', items: [item('q01', 'p01', 'a'), item('q02', 'p09', 'b'), item('q03', 'p02', 'a')] };
  const issues = validateBlueprint(bp, doc, { count: 2, types: ['mcq'] });
  assert.ok(issues.some((i) => /exactly 2/.test(i)));
  assert.ok(issues.some((i) => /p09/.test(i)));
  assert.ok(issues.some((i) => /test the same thing/.test(i)));
  const { blueprint, notes } = repairBlueprint(bp, doc, { count: 2, types: ['mcq'] });
  assert.deepEqual(blueprint.items.map((i) => [i.key, i.passageId]), [['q01', 'p01']]);
  assert.equal(notes.length, 3);
});
