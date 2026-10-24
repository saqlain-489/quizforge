import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { chainsFromEnv, costOf, type RoleChain } from '../models.ts';
import type { Role } from '../schema.ts';
import { CallLog, type GenerateArgs, type GenerateResult, type LLM } from './types.ts';

export interface AnthropicLLMOptions {
  client?: Anthropic;
  chains?: Record<Role, RoleChain>;
  log?: CallLog;
}

/**
 * Worth trying the next model in the chain: the request was fine, the model
 * was not available. A 400 is our bug and fails the same way on every model,
 * so it is thrown instead.
 */
export function isUnavailable(err: unknown): boolean {
  return err instanceof Anthropic.RateLimitError
    || err instanceof Anthropic.InternalServerError
    || err instanceof Anthropic.APIConnectionError;
}

/** The structured reply, or null when it is missing, truncated or off-schema; the caller retries with feedback. */
function parseObject<T>(blocks: Anthropic.Beta.BetaContentBlock[], schema: z.ZodType<T>): T | null {
  const text = blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function anthropicLLM(opts: AnthropicLLMOptions = {}): LLM {
  const client = opts.client ?? new Anthropic({ maxRetries: 2, timeout: 180_000 });
  const chains = opts.chains ?? chainsFromEnv();
  const log = opts.log ?? new CallLog();

  return {
    mode: 'live',
    available: () => Boolean(opts.client || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),

    async generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
      const chain = chains[args.role];
      let lastErr: unknown = new Error(`no models configured for role ${args.role}`);

      for (const model of chain.models) {
        const t0 = Date.now();
        try {
          const content: Anthropic.Beta.BetaTextBlockParam[] = [];
          // The document is the same for every call of a run, so it goes first and is cached.
          if (args.context) content.push({ type: 'text', text: args.context, cache_control: { type: 'ephemeral' } });
          content.push({ type: 'text', text: args.prompt });

          // create(), not parse(): parse() throws on a refusal or truncated JSON before stop_reason can be read.
          const res = await client.beta.messages.create(
            {
              model,
              max_tokens: 16000,
              betas: ['server-side-fallback-2026-07-01'],
              // A policy decline is re-run server-side on the model's default fallback.
              fallbacks: 'default',
              system: [{ type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }],
              messages: [{ role: 'user', content }],
              output_config: { format: betaZodOutputFormat(args.schema), effort: chain.effort },
            },
            { signal: args.signal },
          );

          const usage = {
            inputTokens: res.usage.input_tokens,
            outputTokens: res.usage.output_tokens,
            cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
          };
          const served = res.model || model;
          const refused = res.stop_reason === 'refusal';
          const object = refused ? null : parseObject(res.content, args.schema);
          log.add({
            role: args.role, tag: args.tag, model: served, ok: object !== null, ms: Date.now() - t0, ...usage,
            costUsd: costOf(served, usage),
            note: refused ? 'refusal' : object === null ? `unparseable (stop: ${res.stop_reason})` : undefined,
          });
          return { object, refused, model: served, usage, stopReason: res.stop_reason };
        } catch (err) {
          if (!isUnavailable(err)) throw err;
          lastErr = err;
          log.add({
            role: args.role, tag: args.tag, model, ok: false, ms: Date.now() - t0,
            inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
            note: `unavailable: ${err instanceof Anthropic.APIError ? err.status ?? 'connection' : 'error'}`,
          });
        }
      }
      throw lastErr;
    },
  };
}
