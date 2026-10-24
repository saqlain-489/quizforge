import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
const cache = new Map<string, string>();

/**
 * The system prompt for a role, from prompts/<key>.prompt.yml. A missing or
 * empty prompt throws at start-up: an agent quietly running on a default
 * prompt produces plausible, wrong output, which is worse than not starting.
 */
export function loadPrompt(key: string): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const file = join(PROMPTS_DIR, `${key}.prompt.yml`);
  if (!existsSync(file)) throw new Error(`prompt file not found: ${file}`);
  const data = load(readFileSync(file, 'utf8')) as { messages?: { role: string; content: string }[] } | undefined;
  const text = data?.messages?.filter((m) => m.role === 'system').map((m) => m.content.trim()).join('\n\n');
  if (!text) throw new Error(`prompt ${file} has no system message`);
  cache.set(key, text);
  return text;
}
