import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkItem } from './checks/index.ts';
import { anthropicLLM } from './llm/anthropic.ts';
import { loadReplay, replayLLM } from './llm/replay.ts';
import { CallLog, type LLM } from './llm/types.ts';
import type { PipelineEvent } from './pipeline.ts';
import { summaryLines, toMarkdown } from './report.ts';
import { ITEM_TYPES, type ItemType, type QuizRun } from './schema.ts';
import { runQuizWorkflow } from './workflow.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `quizforge: turn a document into a checked, source-cited quiz

  quizforge generate <file-or-url> [--count 8] [--types mcq,true_false,fill_blank,short_answer]
                                   [--out runs] [--replay script.json] [--no-judge]
  quizforge demo                   replay the bundled example (no API key, no cost)
  quizforge check <quiz.json>      re-run the deterministic checks on a saved quiz

Live runs need ANTHROPIC_API_KEY. Models per role: see src/models.ts (QUIZFORGE_MODELS_<ROLE> overrides).`;

const ICON: Record<string, string> = { ok: '✓', fixed: '↻', revised: '✎', dropped: '✗' };

function logEvent(e: PipelineEvent): void {
  if (e.type === 'plan') {
    console.log(`plan   ${e.items} questions (attempt ${e.attempts})${e.notes.length ? ` · ${e.notes.join('; ')}` : ''}`);
  } else {
    console.log(`${ICON[e.status] ?? '·'} ${e.key}   ${e.detail}`);
  }
}

const slug = (s: string) => basename(s).replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quiz';

async function save(run: QuizRun, outDir: string, name: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const base = join(outDir, `${name}.quiz`);
  await writeFile(`${base}.json`, `${JSON.stringify(run, null, 2)}\n`);
  await writeFile(`${base}.md`, toMarkdown(run));
  return base;
}

async function generate(source: string, flags: { count: number; types: ItemType[]; out: string; replay?: string; judge: boolean }): Promise<QuizRun> {
  const log = new CallLog();
  const llm: LLM = flags.replay ? replayLLM(loadReplay(flags.replay), log) : anthropicLLM({ log });
  if (!llm.available()) throw new Error('ANTHROPIC_API_KEY is not set. Set it, or try `quizforge demo` for a free replay.');
  const run = await runQuizWorkflow({ source, count: flags.count, types: flags.types }, { llm, log, judge: flags.judge, onEvent: logEvent });
  const base = await save(run, flags.out, slug(source));
  console.log(['', `Source: ${run.source.title} (${run.source.words} words, ${run.source.passages.length} passages)`, ...summaryLines(run), `Saved ${base}.json and ${base}.md`].join('\n'));
  return run;
}

async function check(file: string): Promise<number> {
  const run = JSON.parse(await readFile(file, 'utf8')) as QuizRun;
  let problems = 0;
  for (const item of run.quiz.items) {
    const passage = run.source.passages.find((p) => p.id === item.passageId);
    const defects = passage ? checkItem(item.content, passage) : [{ code: 'unknown_passage', message: `no passage ${item.passageId}`, refuse: true }];
    problems += defects.length;
    console.log(defects.length ? `✗ ${item.key}  ${defects.map((d) => d.code).join(', ')}` : `✓ ${item.key}`);
  }
  console.log(problems ? `${problems} problem(s) found.` : 'Every item passes the deterministic checks.');
  return problems ? 1 : 0;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      count: { type: 'string', default: '8' },
      types: { type: 'string', default: ITEM_TYPES.join(',') },
      out: { type: 'string', default: 'runs' },
      replay: { type: 'string' },
      'no-judge': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [cmd, target] = positionals;
  if (values.help || !cmd) { console.log(HELP); return 0; }

  const types = values.types.split(',').map((t) => t.trim()).filter(Boolean) as ItemType[];
  const bad = types.filter((t) => !(ITEM_TYPES as readonly string[]).includes(t));
  if (bad.length) throw new Error(`unknown question type(s): ${bad.join(', ')}. Use ${ITEM_TYPES.join(', ')}.`);
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error('--count must be a whole number from 1 to 40');

  if (cmd === 'demo') {
    await generate(join(ROOT, 'examples/sources/http-caching.md'), {
      count: 8, types: [...ITEM_TYPES], out: join(ROOT, 'examples/out'), replay: join(ROOT, 'examples/replay/http-caching.json'), judge: true,
    });
    return 0;
  }
  if (cmd === 'generate' && target) {
    await generate(target, { count, types, out: values.out, replay: values.replay, judge: !values['no-judge'] });
    return 0;
  }
  if (cmd === 'check' && target) return check(target);
  console.log(HELP);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code), (err: unknown) => {
    console.error(`quizforge: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
