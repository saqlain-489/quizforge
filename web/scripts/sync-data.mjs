// The saved quiz keeps only final verdicts, so replay runs are re-run here to record every agent call.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS, checkItem, itemText } from '../../src/checks/index.ts';
import { JUDGE_DIMS, applyEvidenceRule, dimsFor, needsEscalation } from '../../src/judge.ts';
import { loadReplay, replayLLM } from '../../src/llm/replay.ts';
import { CallLog } from '../../src/llm/types.ts';
import { DEFAULT_CHAINS } from '../../src/models.ts';
import { runPipeline } from '../../src/pipeline.ts';
import { validateBlueprint } from '../../src/plan.ts';
import { ITEM_TYPES } from '../../src/schema.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..');
const OUT_DIR = join(ROOT, 'examples/out');
const REPLAY_DIR = join(ROOT, 'examples/replay');
const SOURCES = 'examples/sources';
const TARGET = join(WEB, 'src/data/runs.ts');

const checks = Object.fromEntries(CHECKS.map((c) => [c.code, c.description]));
const dims = Object.fromEntries(JUDGE_DIMS.map((d) => [d.id, { name: d.name, blocking: d.blocking, threshold: d.threshold }]));
const models = Object.fromEntries(Object.entries(DEFAULT_CHAINS).map(([role, chain]) => [role, chain.models[0]]));

// A local absolute path must never ship in the public page.
function publicOrigin(origin) {
  if (/^https?:\/\//i.test(origin) || !isAbsolute(origin)) return origin;
  const inRepo = posix.join(SOURCES, basename(origin));
  return existsSync(join(ROOT, inRepo)) ? inRepo : basename(origin);
}

function publicRun(run) {
  return {
    ...run,
    source: { ...run.source, origin: publicOrigin(run.source.origin) },
    report: { ...run.report, source: { ...run.report.source, origin: publicOrigin(run.report.source.origin) } },
  };
}

function recordingLLM(inner, calls) {
  return {
    mode: inner.mode,
    available: () => inner.available(),
    async generate(args) {
      const call = { role: args.role, tag: args.tag, object: null, error: null };
      calls.push(call);
      try {
        const res = await inner.generate(args);
        call.object = res.object;
        if (res.refused) call.error = 'the model declined';
        return res;
      } catch (err) {
        call.error = err instanceof Error ? err.message : String(err);
        throw err;
      }
    },
  };
}

function judgeEvent(call, item, draft, passage, revised) {
  const base = { kind: 'judge', role: call.role, rewrite: revised, dims: {}, blockers: [], escalates: false, discarded: [] };
  if (!call.object || !draft) return { ...base, error: call.error ?? 'no verdict' };
  const body = `${itemText(draft)}\n${passage.text}`;
  const applicable = dimsFor(item.content.type);
  for (const d of applicable) {
    const raw = call.object[d.id];
    if (!raw) {
      base.dims[d.id] = { score: 0, status: 'not_run', threshold: d.threshold, pass: null, issues: [], evidence: null };
      continue;
    }
    const verdict = applyEvidenceRule(raw, d, body);
    base.dims[d.id] = verdict;
    if (verdict.evidenceDiscarded) base.discarded.push({ dim: d.id, score: raw.score, issues: raw.issues, evidence: raw.evidence });
  }
  base.blockers = applicable.filter((d) => d.blocking && base.dims[d.id]?.pass === false).map((d) => d.id);
  base.escalates = call.role === 'judge_screen' && needsEscalation(base.dims);
  return base;
}

async function traceRun(run, replayPath) {
  const calls = [];
  const llm = recordingLLM(replayLLM(loadReplay(replayPath), new CallLog()), calls);
  // The bundled demo asks for every question type; the plan check depends on it.
  const opts = { count: run.report.planned, types: [...ITEM_TYPES] };
  const fresh = await runPipeline(run.source, opts, { llm, log: new CallLog() });

  const saved = JSON.stringify(run.quiz.items);
  if (JSON.stringify(fresh.quiz.items) !== saved) {
    throw new Error(`${basename(replayPath)} no longer reproduces the saved quiz. Regenerate it from the repo root with \`npm run demo\`.`);
  }

  const plan = calls.filter((c) => c.tag === 'plan').map((c) => {
    if (!c.object) return { accepted: false, issues: [c.error ?? 'the planner returned no blueprint'] };
    const issues = validateBlueprint(c.object, run.source, opts);
    return { accepted: issues.length === 0, issues };
  });

  const items = new Map(run.quiz.items.map((i) => [i.key, i]));
  const traces = {};
  const lastDraft = new Map();
  const revised = new Set();
  for (const call of calls) {
    const m = call.tag.match(/^(write|judge):(q\d+)(:rev)?$/);
    const item = m && items.get(m[2]);
    if (!item) continue;
    const key = item.key;
    const passage = run.source.passages.find((p) => p.id === item.passageId);
    const list = (traces[key] ??= []);
    if (m[1] === 'write') {
      if (m[3]) revised.add(key);
      const draft = call.object ? { type: item.content.type, ...call.object } : null;
      if (draft) lastDraft.set(key, draft);
      const defects = draft ? checkItem(draft, passage).map(({ code, message }) => ({ code, message })) : [];
      list.push({ kind: 'write', role: call.role, rewrite: Boolean(m[3]), draft, defects, ...(call.error ? { error: call.error } : {}) });
    } else {
      list.push(judgeEvent(call, item, lastDraft.get(key), passage, revised.has(key)));
    }
  }
  return { plan, traces };
}

const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.quiz.json')).sort();
if (!files.length) throw new Error(`no *.quiz.json files in ${OUT_DIR}`);

const runs = [];
for (const file of files) {
  const name = file.replace(/\.quiz\.json$/, '');
  const run = JSON.parse(await readFile(join(OUT_DIR, file), 'utf8'));
  const replayPath = join(REPLAY_DIR, `${name}.json`);
  const trace = run.report.mode === 'replay' && existsSync(replayPath) ? await traceRun(run, replayPath) : { plan: [], traces: {} };
  runs.push({ name, run: publicRun(run), ...trace, checks, dims, models });
}

await mkdir(dirname(TARGET), { recursive: true });
await writeFile(
  TARGET,
  `// Generated by scripts/sync-data.mjs from examples/. Do not edit.\nimport type { DemoRun } from '@/lib/types';\n\nexport const runs: DemoRun[] = ${JSON.stringify(runs, null, 2)};\n`,
);
console.log(`sync-data: ${runs.map((r) => `${r.name} (${r.run.quiz.items.length} items, ${Object.keys(r.traces).length} traced)`).join(', ')}`);
