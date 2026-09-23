import { vi } from 'vitest';

/**
 * A minimal stand-in for a Drizzle query builder chain. Every chainable
 * method returns the same object so any call order works, and the object
 * itself is "thenable" (resolves via `.then()`) so `await db.select()...`
 * resolves to `result` regardless of how long the chain is — the same way
 * Drizzle's real query builders are awaitable without an explicit
 * `.execute()` call. `.returning()` also resolves to `result` directly for
 * insert/update chains.
 */
export function chainable<T>(result: T) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    groupBy: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    values: () => chain,
    set: () => chain,
    returning: () => Promise.resolve(result),
    then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

export function createDbMock() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}
