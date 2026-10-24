import { fileURLToPath } from 'node:url';
import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import { z } from 'zod';
import { CHECKS, checkItem } from '../checks/index.ts';
import { anthropicLLM } from '../llm/anthropic.ts';
import { CallLog } from '../llm/types.ts';
import { summaryLines } from '../report.ts';
import { FillBlankDraftSchema, McqDraftSchema, ShortAnswerDraftSchema, TrueFalseDraftSchema, type Draft } from '../schema.ts';
import { wordCount } from '../text.ts';
import { QuizRequest, runQuizWorkflow } from '../workflow.ts';

const ItemInput = z.discriminatedUnion('type', [
  McqDraftSchema.extend({ type: z.literal('mcq') }),
  TrueFalseDraftSchema.extend({ type: z.literal('true_false') }),
  FillBlankDraftSchema.extend({ type: z.literal('fill_blank') }),
  ShortAnswerDraftSchema.extend({ type: z.literal('short_answer') }),
]);

const DefectOut = z.object({ code: z.string(), message: z.string(), refuse: z.boolean() });

export const checkQuizItem = createTool({
  id: 'check_quiz_item',
  description: 'Run quizforge\'s deterministic checks on one quiz item against the passage it should be answered from. '
    + 'Free and instant (no model call). Returns each defect with an instruction for fixing it; an empty list means the item passed.',
  inputSchema: z.object({ passage: z.string().describe('the source text the item must be answerable from'), item: ItemInput }),
  outputSchema: z.object({ defects: z.array(DefectOut) }),
  execute: async ({ passage, item }) => ({
    defects: checkItem(item as Draft, { id: 'p01', heading: null, text: passage, words: wordCount(passage) }),
  }),
});

export const listChecks = createTool({
  id: 'list_checks',
  description: 'List the deterministic checks quizforge applies to every quiz item, and which of them drop an item outright.',
  inputSchema: z.object({}),
  outputSchema: z.object({ checks: z.array(z.object({ code: z.string(), refuse: z.boolean(), description: z.string() })) }),
  execute: async () => ({ checks: CHECKS.map(({ code, refuse, description }) => ({ code, refuse, description })) }),
});

export const generateQuiz = createTool({
  id: 'generate_quiz',
  description: 'Generate a checked, source-cited quiz from a file path or URL with the full multi-agent pipeline. '
    + 'Calls Claude (needs ANTHROPIC_API_KEY on the server) and costs a few cents per quiz.',
  inputSchema: QuizRequest,
  outputSchema: z.object({ summary: z.array(z.string()), quiz: z.unknown() }),
  execute: async (input) => {
    const log = new CallLog();
    const run = await runQuizWorkflow(input, { llm: anthropicLLM({ log }), log });
    return { summary: summaryLines(run), quiz: run.quiz };
  },
});

export function createServer(): MCPServer {
  return new MCPServer({
    id: 'quizforge',
    name: 'quizforge',
    version: '0.1.0',
    description: 'Checks and generates source-cited quiz questions.',
    tools: { check_quiz_item: checkQuizItem, list_checks: listChecks, generate_quiz: generateQuiz },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await createServer().startStdio();
}
