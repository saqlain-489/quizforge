import { readFileSync } from 'node:fs';
import { ZERO_USAGE } from '../models.ts';
import { CallLog, type GenerateArgs, type GenerateResult, type LLM } from './types.ts';

/**
 * One scripted reply. `object` is what the model "returned"; `refuse` and
 * `fail` reproduce a policy decline and a provider error so every branch of
 * the pipeline can be exercised without a key.
 */
export type ReplayStep =
  | { object: unknown; model?: string }
  | { refuse: true }
  | { fail: string };

/** Replies queued per `role|tag`, consumed in order. */
export type ReplayScript = Record<string, ReplayStep[]>;

export function loadReplay(path: string): ReplayScript {
  return JSON.parse(readFileSync(path, 'utf8')) as ReplayScript;
}

/**
 * A scripted model: real pipeline code, recorded answers. Used by the tests,
 * the eval harness and the public demo, so all three run free and give the
 * same result every time.
 */
export function replayLLM(script: ReplayScript, log: CallLog = new CallLog()): LLM & { remaining(): string[] } {
  const queues = new Map(Object.entries(script).map(([k, v]) => [k, [...v]]));
  return {
    mode: 'replay',
    available: () => true,
    remaining: () => [...queues].filter(([, q]) => q.length).map(([k, q]) => `${k} (${q.length})`),

    async generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
      const key = `${args.role}|${args.tag}`;
      const step = queues.get(key)?.shift();
      if (!step) throw new Error(`replay script has no reply left for ${key}`);
      const base = { role: args.role, tag: args.tag, ms: 0, ...ZERO_USAGE, costUsd: 0 };
      if ('fail' in step) {
        log.add({ ...base, model: 'replay', ok: false, note: step.fail });
        throw new Error(step.fail);
      }
      if ('refuse' in step) {
        log.add({ ...base, model: 'replay', ok: false, note: 'refusal' });
        return { object: null, refused: true, model: 'replay', usage: ZERO_USAGE, stopReason: 'refusal' };
      }
      // Parsed like a live reply, so a script that drifts from the schema fails loudly.
      const parsed = args.schema.safeParse(step.object);
      if (!parsed.success) throw new Error(`replay reply for ${key} does not match the schema: ${parsed.error.issues[0]?.message}`);
      const model = step.model ?? 'replay';
      log.add({ ...base, model, ok: true });
      return { object: parsed.data, refused: false, model, usage: ZERO_USAGE, stopReason: 'end_turn' };
    },
  };
}
