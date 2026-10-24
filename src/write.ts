import type { z } from 'zod';
import { checkItem, codesOf } from './checks/index.ts';
import { raceWithTimeout } from './concurrency.ts';
import type { LLM } from './llm/types.ts';
import { renderDocument } from './plan.ts';
import { loadPrompt } from './prompts.ts';
import { DRAFT_SCHEMAS, type BlueprintItem, type Draft, type Passage, type Role, type SourceDoc } from './schema.ts';

/** One hung connection costs one round, never a frozen lane. */
export const WRITER_TIMEOUT_MS = 150_000;

export interface WriteOutcome {
  draft: Draft | null;
  rounds: number;
  model: string | null;
  /** Codes the checker caught on an earlier round that the final draft no longer has. */
  fixed: string[];
  warnings: string[];
  gapReason?: string;
}

const TYPE_ASK: Record<Draft['type'], string> = {
  mcq: 'a multiple-choice question with four options',
  true_false: 'a true/false statement',
  fill_blank: 'a fill-in-the-blank sentence',
  short_answer: 'a short-answer question',
};

function brief(spec: BlueprintItem, passage: Passage): string {
  return [
    `Write question ${spec.key}: ${TYPE_ASK[spec.type]}.`,
    `It tests: ${spec.focus}`,
    `Thinking it asks for: ${spec.skill}. Difficulty: ${spec.difficulty}.`,
    `Answer it from passage ${passage.id}${passage.heading ? ` (${passage.heading})` : ''} only. Its text:`,
    passage.text,
  ].join('\n');
}

/**
 * Write one item, check it, and retry with the checker's exact words until it
 * passes or the rounds run out. The final round goes to the stronger model:
 * the cheap writer has had its chances, and one strong call is cheaper than
 * a dropped question. On the last round a refusing defect drops the item;
 * anything milder ships with a warning, because a slightly long option beats
 * no question at all.
 */
export async function writeItem(args: {
  spec: BlueprintItem;
  doc: SourceDoc;
  llm: LLM;
  maxRounds?: number;
  /** A reviewer's objections to an earlier version; turns this call into a rewrite. */
  reviewerNotes?: string[];
  tagSuffix?: string;
}): Promise<WriteOutcome> {
  const { spec, doc, llm } = args;
  const maxRounds = Math.max(1, args.maxRounds ?? 3);
  const passage = doc.passages.find((p) => p.id === spec.passageId);
  if (!passage) return { draft: null, rounds: 0, model: null, fixed: [], warnings: [], gapReason: `unknown passage ${spec.passageId}` };

  const system = loadPrompt('writer');
  const context = renderDocument(doc);
  const schema: z.ZodType<unknown> = DRAFT_SCHEMAS[spec.type];
  let base = brief(spec, passage);
  if (args.reviewerNotes?.length) {
    base += `\n\nA reviewer rejected an earlier version of this question:\n${args.reviewerNotes.map((n) => `- ${n}`).join('\n')}\nWrite a new version that fixes these problems.`;
  }

  let feedback = '';
  let lastReason = 'failed after retries';
  let lastModel: string | null = null;
  const caught = new Set<string>();

  for (let round = 1; round <= maxRounds; round++) {
    const role: Role = round === maxRounds && maxRounds > 1 ? 'writer_strong' : 'writer';
    const prompt = feedback
      ? `${base}\n\nYour previous attempt was REJECTED by the checker. Fix exactly this and try again:\n${feedback}`
      : base;

    let res;
    try {
      res = await raceWithTimeout(
        llm.generate({ role, tag: `write:${spec.key}${args.tagSuffix ?? ''}`, system, context, prompt, schema }),
        WRITER_TIMEOUT_MS,
        `writer(${spec.key})`,
      );
    } catch (err) {
      feedback = '- The previous attempt did not complete. Write the complete question.';
      lastReason = `writer call failed: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
    lastModel = res.model;
    if (res.refused) {
      // A declined prompt is declined again verbatim; ask for different wording instead.
      feedback = '- The previous attempt was declined by a safety filter. Ask about the subject in neutral, factual wording.';
      lastReason = 'writer declined';
      continue;
    }
    if (!res.object) {
      feedback = '- The previous attempt was empty. Write the complete question.';
      lastReason = 'writer returned nothing';
      continue;
    }

    const draft = { type: spec.type, ...(res.object as object) } as Draft;
    const defects = checkItem(draft, passage);
    if (!defects.length) return { draft, rounds: round, model: res.model, fixed: [...caught], warnings: [] };

    for (const d of defects) caught.add(d.code);
    if (round < maxRounds) {
      feedback = defects.map((d) => `- ${d.message}`).join('\n');
      lastReason = `checker: ${codesOf(defects).join(', ')}`;
      continue;
    }
    const fatal = defects.filter((d) => d.refuse);
    if (fatal.length) {
      return { draft: null, rounds: round, model: res.model, fixed: [], warnings: [], gapReason: `refused after ${round} rounds: ${codesOf(fatal).join(', ')}` };
    }
    const left = new Set(codesOf(defects));
    return { draft, rounds: round, model: res.model, fixed: [...caught].filter((c) => !left.has(c)), warnings: defects.map((d) => d.message) };
  }
  return { draft: null, rounds: maxRounds, model: lastModel, fixed: [], warnings: [], gapReason: lastReason };
}
