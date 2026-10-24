import { runs } from '@/data/runs';
import type { DemoRun } from './types';

const DEMO_NAME = 'http-caching';
export const REPO_URL = 'https://github.com/saqlain-489/quizforge';

export function demoRun(): DemoRun {
  const run = runs.find((r) => r.name === DEMO_NAME) ?? runs[0];
  if (!run) throw new Error('no quiz runs were bundled; run `npm run sync-data`');
  return run;
}

export function sourceUrl(origin: string): string | null {
  if (/^https?:\/\//i.test(origin)) return origin;
  return origin.startsWith('examples/') ? `${REPO_URL}/blob/main/${origin}` : null;
}
