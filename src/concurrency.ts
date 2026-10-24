/** Caps concurrent async work; callers queue in arrival order. */
export class Semaphore {
  private readonly queue: Array<() => void> = [];
  private active = 0;

  constructor(private readonly max: number) {
    if (!Number.isInteger(max) || max < 1) throw new Error(`Semaphore needs a positive integer, got ${max}`);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

/** Map with at most `limit` calls in flight; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}

export class TimeoutError extends Error {}

/**
 * Settle at the deadline even if the call never does. An abort signal saves
 * tokens when the client honours it; this race is what guarantees the lane
 * moves on when it doesn't.
 */
export function raceWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}
