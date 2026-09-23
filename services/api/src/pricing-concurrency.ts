// Shared across overlapping explicit refreshes and on-demand requests in this process.
export function createPricingLimiter(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("INVALID_PRICING_CONCURRENCY");
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function limited<T>(operation: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try { return await operation(); }
    finally {
      const next = waiting.shift();
      if (next) next(); // Transfer this slot without allowing a newcomer to overtake it.
      else active--;
    }
  };
}

export async function settledPricingMap<T, R>(
  items: T[], limit: number, operation: (item: T) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("INVALID_PRICING_CONCURRENCY");
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = {status: "fulfilled", value: await operation(items[index])}; }
      catch (reason) { results[index] = {status: "rejected", reason}; }
    }
  }));
  return results;
}

export const limitPricingMarket = createPricingLimiter(2);
export const limitPricingAdapter = createPricingLimiter(4);
