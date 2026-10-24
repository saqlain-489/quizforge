import type { z } from 'zod';
import type { CallRecord, Role } from '../schema.ts';
import type { Usage } from '../models.ts';

export interface GenerateArgs<T> {
  role: Role;
  /** Which job this call belongs to (`plan`, `write:q03`, `judge:q03`). Replays are keyed on it. */
  tag: string;
  system: string;
  /** Long, shared context (the source document). Sent first and marked cacheable. */
  context?: string;
  prompt: string;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
}

export interface GenerateResult<T> {
  object: T | null;
  /** The model declined for policy reasons; the caller should reword, not resend. */
  refused: boolean;
  model: string;
  usage: Usage;
  stopReason: string | null;
}

/** The one seam between the pipeline and a model provider. */
export interface LLM {
  readonly mode: 'live' | 'replay';
  available(): boolean;
  generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>>;
}

/** Every model call of a run, for the cost and latency report. */
export class CallLog {
  readonly calls: CallRecord[] = [];
  add(rec: CallRecord): void {
    this.calls.push(rec);
  }
}
