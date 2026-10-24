import assert from 'node:assert/strict';
import { test } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { checkItem } from '../src/checks/index.ts';
import { loadSource } from '../src/ingest.ts';
import { anthropicLLM } from '../src/llm/anthropic.ts';
import { loadReplay, replayLLM } from '../src/llm/replay.ts';
import { CallLog } from '../src/llm/types.ts';
import { DEFAULT_CHAINS } from '../src/models.ts';
import { runPipeline } from '../src/pipeline.ts';
import { ITEM_TYPES, McqDraftSchema } from '../src/schema.ts';
import { GOOD_MCQ } from './helpers.ts';

test('the bundled replay runs the whole pipeline and every delivered item passes the checks', async () => {
  const doc = await loadSource('examples/sources/http-caching.md');
  const log = new CallLog();
  const llm = replayLLM(loadReplay('examples/replay/http-caching.json'), log);
  const run = await runPipeline(doc, { count: 8, types: [...ITEM_TYPES] }, { llm, log });

  assert.deepEqual(llm.remaining(), [], 'every scripted reply is consumed');
  assert.equal(run.report.planned, 8);
  assert.equal(run.report.delivered, 8);
  assert.equal(run.report.fixedByRetry, 2);
  assert.equal(run.report.revisedAfterJudge, 1);
  assert.equal(run.report.judge.escalations, 1);
  assert.deepEqual(run.report.defectsCaught, { mcq_key_is_longest: 1, quote_not_in_passage: 1 });
  for (const item of run.quiz.items) {
    const passage = doc.passages.find((p) => p.id === item.passageId)!;
    assert.deepEqual(checkItem(item.content, passage), [], item.key);
    if (item.content.type === 'mcq') assert.ok(item.content.options.includes(item.content.answer));
  }
  const q07 = run.quiz.items.find((i) => i.key === 'q07')!;
  assert.equal(q07.judge?.dims.clarity.evidenceDiscarded, true, 'an unquoted judge complaint is dropped');
});

/** A fake network for the real SDK: records requests, answers from a queue. */
function fakeAnthropic(replies: Array<{ status: number; body: unknown }>) {
  const requests: { url: string; headers: Headers; body: any }[] = [];
  const client = new Anthropic({
    apiKey: 'test-key',
    maxRetries: 0,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      const next = replies.shift() ?? { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'no reply queued' } } };
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
    },
  });
  return { client, requests };
}

const message = (model: string, text: string, stop = 'end_turn') => ({
  status: 200,
  body: {
    id: 'msg_1', type: 'message', role: 'assistant', model, stop_reason: stop, stop_sequence: null,
    content: [{ type: 'text', text }],
    usage: { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 4000 },
  },
});

test('live adapter: structured output, server-side fallback, cached system and document blocks', async () => {
  const { client, requests } = fakeAnthropic([message('claude-sonnet-5-5', JSON.stringify(GOOD_MCQ))]);
  const log = new CallLog();
  const llm = anthropicLLM({ client, log, chains: DEFAULT_CHAINS });
  const res = await llm.generate({ role: 'writer', tag: 'write:q01', system: 'sys', context: 'the document', prompt: 'brief', schema: McqDraftSchema });

  assert.deepEqual(res.object, GOOD_MCQ);
  const req = requests[0];
  assert.match(req.url, /\/v1\/messages/);
  assert.equal(req.body.model, 'claude-sonnet-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.match(req.headers.get('anthropic-beta') ?? '', /server-side-fallback-2026-07-01/);
  assert.equal(req.body.output_config.format.type, 'json_schema');
  assert.equal(req.body.output_config.effort, 'medium');
  assert.equal(req.body.system[0].cache_control.type, 'ephemeral');
  assert.equal(req.body.messages[0].content[0].text, 'the document');
  assert.equal(req.body.messages[0].content[0].cache_control.type, 'ephemeral');
  assert.equal(req.body.tool_choice, undefined, 'no forced tool use: it is a 400 on current models');
  assert.ok(log.calls[0].costUsd > 0 && log.calls[0].cacheReadTokens === 4000);
});

test('live adapter: an overloaded model falls through to the next in the chain; a 400 does not', async () => {
  const overloaded = { status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } };
  const { client, requests } = fakeAnthropic([overloaded, message('claude-opus-5-5', JSON.stringify(GOOD_MCQ))]);
  const log = new CallLog();
  const res = await anthropicLLM({ client, log, chains: DEFAULT_CHAINS })
    .generate({ role: 'writer', tag: 'w', system: 's', prompt: 'p', schema: McqDraftSchema });
  assert.equal(res.model, 'claude-opus-5-5');
  assert.deepEqual(requests.map((r) => r.body.model), ['claude-sonnet-5-5', 'claude-opus-5-5']);
  assert.equal(log.calls[0].ok, false);

  const bad = fakeAnthropic([{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } } }]);
  await assert.rejects(anthropicLLM({ client: bad.client, chains: DEFAULT_CHAINS }).generate({ role: 'writer', tag: 'w', system: 's', prompt: 'p', schema: McqDraftSchema }));
  assert.equal(bad.requests.length, 1);
});

test('live adapter: a refusal is reported, not parsed', async () => {
  const { client } = fakeAnthropic([message('claude-sonnet-5-5', '', 'refusal')]);
  const res = await anthropicLLM({ client, chains: DEFAULT_CHAINS }).generate({ role: 'writer', tag: 'w', system: 's', prompt: 'p', schema: McqDraftSchema });
  assert.equal(res.refused, true);
  assert.equal(res.object, null);
});
