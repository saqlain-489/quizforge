import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { loadReplay, replayLLM } from '../src/llm/replay.ts';
import { CallLog } from '../src/llm/types.ts';
import { runQuizWorkflow } from '../src/workflow.ts';
import { GOOD_MCQ, PASSAGE } from './helpers.ts';

test('the Mastra workflow runs every step and delivers the same quiz as the plain pipeline', async () => {
  const log = new CallLog();
  const llm = replayLLM(loadReplay('examples/replay/http-caching.json'), log);
  const steps: string[] = [];
  const run = await runQuizWorkflow(
    { source: 'examples/sources/http-caching.md', count: 8 },
    { llm, log, onEvent: (e) => steps.push(e.type) },
  );
  assert.deepEqual(llm.remaining(), []);
  assert.equal(run.report.delivered, 8);
  assert.equal(run.report.revisedAfterJudge, 1);
  assert.equal(steps[0], 'plan');
});

test('the MCP server starts over stdio, lists its tools and runs the free checker', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/mcp/server.ts'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const replies = new Map<number, any>();
  const waiters = new Map<number, (v: any) => void>();
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      if (typeof msg.id === 'number') { replies.set(msg.id, msg); waiters.get(msg.id)?.(msg); }
    } catch { /* log lines */ }
  });
  const send = (msg: object) => child.stdin.write(`${JSON.stringify(msg)}\n`);
  const reply = (id: number) => new Promise<any>((resolve, reject) => {
    if (replies.has(id)) return resolve(replies.get(id));
    waiters.set(id, resolve);
    setTimeout(() => reject(new Error(`no reply to request ${id}`)), 20_000).unref();
  });

  try {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
    await reply(1);
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = (await reply(2)).result.tools.map((t: { name: string }) => t.name).sort();
    assert.deepEqual(tools, ['check_quiz_item', 'generate_quiz', 'list_checks']);

    const longKey = { ...GOOD_MCQ, options: ['304 Not Modified with no body, telling the cache its stored copy is still valid', '200 OK', '404', '412'], answer: '304 Not Modified with no body, telling the cache its stored copy is still valid' };
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_quiz_item', arguments: { passage: PASSAGE.text, item: { type: 'mcq', ...longKey } } } });
    const called = await reply(3);
    assert.match(JSON.stringify(called.result), /mcq_key_is_longest/);
  } finally {
    child.kill();
  }
});
