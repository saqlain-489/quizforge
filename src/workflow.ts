import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { loadSource } from './ingest.ts';
import { planQuiz } from './plan.ts';
import { buildReport, produceAll, type PipelineDeps, type ProduceOutcome } from './pipeline.ts';
import { ITEM_TYPES, type Blueprint, type QuizRun, type SourceDoc } from './schema.ts';

export const QuizRequest = z.object({
  source: z.string().describe('a file path or http(s) URL: Markdown, text, HTML or PDF'),
  count: z.number().int().min(1).max(40).default(8),
  types: z.array(z.enum(ITEM_TYPES)).min(1).default([...ITEM_TYPES]),
});

const Common = { doc: z.custom<SourceDoc>(), count: z.number(), types: z.array(z.enum(ITEM_TYPES)), startedAt: z.string() };
const Ingested = z.object(Common);
const Planned = z.object({ ...Common, blueprint: z.custom<Blueprint>(), notes: z.array(z.string()) });
const Produced = z.object({ ...Common, title: z.string(), planned: z.number(), notes: z.array(z.string()), outcomes: z.custom<ProduceOutcome[]>() });

/**
 * The pipeline as a Mastra workflow: the same stage functions the CLI uses,
 * wired as steps so a run shows up step by step in Mastra's tracing and
 * playground, and can be exposed to other agents through the MCP server.
 */
export function createQuizWorkflow(deps: PipelineDeps) {
  const ingest = createStep({
    id: 'ingest',
    description: 'Load the document and split it into numbered passages',
    inputSchema: QuizRequest,
    outputSchema: Ingested,
    execute: async ({ inputData }) => ({
      doc: await loadSource(inputData.source), count: inputData.count, types: inputData.types, startedAt: new Date().toISOString(),
    }),
  });

  const plan = createStep({
    id: 'plan',
    description: 'The planner agent drafts a blueprint; code validates it and sends it back with exact fixes',
    inputSchema: Ingested,
    outputSchema: Planned,
    execute: async ({ inputData }) => {
      const p = await planQuiz(inputData.doc, { count: inputData.count, types: inputData.types }, deps.llm);
      deps.onEvent?.({ type: 'plan', items: p.blueprint.items.length, attempts: p.attempts, notes: p.notes });
      return { ...inputData, blueprint: p.blueprint, notes: p.notes };
    },
  });

  const produce = createStep({
    id: 'produce',
    description: 'Writer agents draft each item in parallel; checks and the judge send items back until they pass',
    inputSchema: Planned,
    outputSchema: Produced,
    execute: async ({ inputData }) => ({
      doc: inputData.doc, count: inputData.count, types: inputData.types, startedAt: inputData.startedAt, notes: inputData.notes,
      title: inputData.blueprint.title, planned: inputData.blueprint.items.length,
      outcomes: await produceAll(inputData.blueprint, inputData.doc, deps),
    }),
  });

  const assemble = createStep({
    id: 'assemble',
    description: 'Order the items and write the run report: retries, escalations, drops, tokens and cost',
    inputSchema: Produced,
    outputSchema: z.custom<QuizRun>(),
    execute: async ({ inputData }) => ({
      quiz: { title: inputData.title, items: inputData.outcomes.flatMap((o) => (o.item ? [o.item] : [])) },
      source: inputData.doc,
      report: buildReport({
        mode: deps.llm.mode, startedAt: new Date(inputData.startedAt), doc: inputData.doc, planned: inputData.planned,
        outcomes: inputData.outcomes, calls: deps.log.calls, notes: inputData.notes,
      }),
    }),
  });

  return createWorkflow({
    id: 'quizforge',
    description: 'Turn a document into a checked, source-cited quiz',
    inputSchema: QuizRequest,
    outputSchema: z.custom<QuizRun>(),
  })
    .then(ingest)
    .then(plan)
    .then(produce)
    .then(assemble)
    .commit();
}

export async function runQuizWorkflow(input: z.input<typeof QuizRequest>, deps: PipelineDeps): Promise<QuizRun> {
  const run = await createQuizWorkflow(deps).createRun();
  const res = await run.start({ inputData: QuizRequest.parse(input) });
  if (res.status !== 'success') {
    const why = res.status === 'failed' ? String((res as { error?: unknown }).error ?? 'unknown error') : res.status;
    throw new Error(`quiz workflow did not finish: ${why}`);
  }
  return res.result as QuizRun;
}
