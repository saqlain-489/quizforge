import { z } from 'zod';

export const ITEM_TYPES = ['mcq', 'true_false', 'fill_blank', 'short_answer'] as const;
export const SKILLS = ['recall', 'understand', 'apply', 'analyze'] as const;
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export type ItemType = (typeof ITEM_TYPES)[number];
export type Skill = (typeof SKILLS)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface Passage {
  id: string;
  heading: string | null;
  text: string;
  words: number;
}

export interface SourceDoc {
  title: string;
  origin: string;
  hash: string;
  words: number;
  passages: Passage[];
}

/* ------------------------------------------------------------------ */
/* What the planner writes                                              */
/* ------------------------------------------------------------------ */

// Counts and lengths are checked in code after parsing, not in the schema:
// a model that writes one item too many should get a precise retry message,
// not lose the whole plan to a validation error.
export const BlueprintItemSchema = z.object({
  key: z.string().describe('q01, q02, … in quiz order'),
  type: z.enum(ITEM_TYPES),
  passageId: z.string().describe('id of the one passage this item is answered from, e.g. p03'),
  skill: z.enum(SKILLS),
  difficulty: z.enum(DIFFICULTIES),
  focus: z.string().describe('one sentence naming the single fact or idea this item tests'),
});

export const BlueprintSchema = z.object({
  title: z.string().describe('a short title for the quiz'),
  items: z.array(BlueprintItemSchema),
});

export type BlueprintItem = z.infer<typeof BlueprintItemSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;

/* ------------------------------------------------------------------ */
/* What a writer returns, per item type                                 */
/* ------------------------------------------------------------------ */

const quote = z.string().describe('one or two sentences copied word for word from the passage that prove the answer');

export const McqDraftSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).describe('exactly four options'),
  answer: z.string().describe('the correct option, copied exactly from options'),
  explanation: z.string().describe('one or two sentences on why the answer is right'),
  sourceQuote: quote,
});

export const TrueFalseDraftSchema = z.object({
  statement: z.string().describe('one declarative sentence that is either true or false according to the passage'),
  answer: z.boolean(),
  explanation: z.string(),
  sourceQuote: quote,
});

export const FillBlankDraftSchema = z.object({
  sentence: z.string().describe('one sentence with exactly one blank written as ____'),
  answer: z.string().describe('the word or short phrase that fills the blank'),
  alternatives: z.array(z.string()).describe('other answers that should also be accepted; may be empty'),
  explanation: z.string(),
  sourceQuote: quote,
});

export const ShortAnswerDraftSchema = z.object({
  question: z.string(),
  modelAnswer: z.string().describe('a complete answer in two or three sentences'),
  rubric: z.array(z.string()).describe('two to four points a correct answer must make'),
  sourceQuote: quote,
});

export const DRAFT_SCHEMAS = {
  mcq: McqDraftSchema,
  true_false: TrueFalseDraftSchema,
  fill_blank: FillBlankDraftSchema,
  short_answer: ShortAnswerDraftSchema,
} as const;

export type McqDraft = z.infer<typeof McqDraftSchema>;
export type TrueFalseDraft = z.infer<typeof TrueFalseDraftSchema>;
export type FillBlankDraft = z.infer<typeof FillBlankDraftSchema>;
export type ShortAnswerDraft = z.infer<typeof ShortAnswerDraftSchema>;

export type Draft =
  | ({ type: 'mcq' } & McqDraft)
  | ({ type: 'true_false' } & TrueFalseDraft)
  | ({ type: 'fill_blank' } & FillBlankDraft)
  | ({ type: 'short_answer' } & ShortAnswerDraft);

/* ------------------------------------------------------------------ */
/* Judge verdicts                                                       */
/* ------------------------------------------------------------------ */

export type DimStatus = 'ok' | 'na' | 'not_run';
export type NotRunCause = 'no_model' | 'timeout' | 'model_error' | 'unparseable' | 'refused';

export interface DimVerdict {
  score: number;
  status: DimStatus;
  threshold: number;
  /** null when the dimension was not graded. */
  pass: boolean | null;
  issues: string[];
  evidence: string | null;
  /** The judge raised an issue it could not quote, so the issue was dropped. */
  evidenceDiscarded?: boolean;
}

export interface JudgeResult {
  status: 'ok' | 'not_run';
  cause?: NotRunCause;
  detail?: string;
  dims: Record<string, DimVerdict>;
  failing: string[];
  blockers: string[];
  tier: 'screen' | 'full';
  escalated: boolean;
  model: string | null;
}

/* ------------------------------------------------------------------ */
/* The finished quiz and its run report                                 */
/* ------------------------------------------------------------------ */

export interface Item {
  key: string;
  passageId: string;
  skill: Skill;
  difficulty: Difficulty;
  focus: string;
  content: Draft;
  generation: {
    rounds: number;
    model: string | null;
    /** Defect codes the checker caught on an earlier round and the writer fixed. */
    fixed: string[];
    warnings: string[];
    revisedAfterJudge: boolean;
  };
  judge: JudgeResult | null;
}

export type Role = 'planner' | 'writer' | 'writer_strong' | 'judge_screen' | 'judge_full';

export interface CallRecord {
  role: Role;
  tag: string;
  model: string;
  ok: boolean;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  note?: string;
}

export interface RunReport {
  runId: string;
  mode: 'live' | 'replay';
  startedAt: string;
  ms: number;
  source: { title: string; origin: string; words: number; passages: number };
  planned: number;
  delivered: number;
  dropped: { key: string; reason: string }[];
  firstTry: number;
  fixedByRetry: number;
  revisedAfterJudge: number;
  defectsCaught: Record<string, number>;
  judge: { graded: number; escalations: number; notRun: number; passed: number };
  byRole: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }>;
  costUsd: number;
  warnings: string[];
}

export interface QuizRun {
  quiz: { title: string; items: Item[] };
  source: SourceDoc;
  report: RunReport;
}
