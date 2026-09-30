/** Pass-through cache port retained for services that may add a cache adapter later. */
export interface JsonCache {
  wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T>;
  invalidate(...keys: string[]): Promise<void>;
  invalidatePrefix(prefix: string): Promise<void>;
}

export function createJsonCache(): JsonCache {
  return {
    wrap: (_key, _ttlSeconds, load) => load(),
    invalidate: (..._keys) => Promise.resolve(),
    invalidatePrefix: (_prefix) => Promise.resolve(),
  };
}

/** Escapes user text for use inside a RegExp (prefix search). */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
