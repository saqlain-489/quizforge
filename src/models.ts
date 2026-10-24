import type { Role } from './schema.ts';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface RoleChain {
  /** Tried in order; the next model is used only when the previous one is unavailable (rate limit, overload, outage). */
  models: string[];
  effort: Effort;
}

/**
 * Which model serves which job. Cheap models do the high-volume work; the
 * strong model plans, rewrites what the cheap writer could not fix in two
 * rounds, and re-judges only what the cheap screen flagged. The judge that
 * escalates is never the model that wrote the item.
 */
export const DEFAULT_CHAINS: Record<Role, RoleChain> = {
  planner: { models: ['claude-opus-5-5', 'claude-sonnet-5-5'], effort: 'medium' },
  writer: { models: ['claude-sonnet-5-5', 'claude-opus-5-5'], effort: 'medium' },
  writer_strong: { models: ['claude-opus-5-5', 'claude-sonnet-5-5'], effort: 'high' },
  judge_screen: { models: ['claude-haiku-5-5', 'claude-sonnet-5-5'], effort: 'low' },
  judge_full: { models: ['claude-opus-5-5', 'claude-sonnet-5-5'], effort: 'medium' },
};

/** QUIZFORGE_MODELS_WRITER="claude-sonnet-5-5,claude-opus-5-5" overrides one role's chain. */
export function chainsFromEnv(env: NodeJS.ProcessEnv = process.env): Record<Role, RoleChain> {
  const out = structuredClone(DEFAULT_CHAINS);
  for (const role of Object.keys(out) as Role[]) {
    const raw = env[`QUIZFORGE_MODELS_${role.toUpperCase()}`];
    const models = raw?.split(',').map((m) => m.trim()).filter(Boolean);
    if (models?.length) out[role].models = models;
  }
  return out;
}

/** USD per million tokens (Anthropic first-party list prices, October 2026). */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Cache writes bill at 1.25x input; an unknown model costs 0 and says so in the report rather than guessing. */
export function costOf(model: string, u: Usage): number {
  const p = PRICES[model];
  if (!p) return 0;
  const usd = (u.inputTokens * p.input + u.cacheWriteTokens * p.input * 1.25 + u.cacheReadTokens * p.cacheRead + u.outputTokens * p.output) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}
