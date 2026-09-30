import { useSyncExternalStore } from 'react';
import type { z } from 'zod';

/**
 * A tiny typed store over localStorage, shared across tabs (storage event) and components
 * (useSyncExternalStore). Every read is schema-validated, and every storage access is
 * guarded: private windows, blocked storage and quota errors fall back to the default.
 * Only non-sensitive UX state lives here (guest cart lines, recently viewed slugs).
 */
export interface LocalStore<T> {
  get: () => T;
  set: (next: T | ((current: T) => T)) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createLocalStore<T>(key: string, schema: z.ZodType<T>, fallback: T): LocalStore<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedValue: T = fallback;

  const read = (): T => {
    if (typeof window === 'undefined') return fallback;
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return fallback;
    }
    // Same raw string → same object, so useSyncExternalStore sees a stable snapshot.
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    if (raw === null) {
      cachedValue = fallback;
      return fallback;
    }
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      cachedValue = parsed.success ? parsed.data : fallback;
    } catch {
      cachedValue = fallback;
    }
    return cachedValue;
  };

  const emit = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  return {
    get: read,
    set(next) {
      const value = typeof next === 'function' ? (next as (c: T) => T)(read()) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage unavailable: keep working in memory for this page view.
        cachedRaw = JSON.stringify(value);
        cachedValue = value;
      }
      emit();
    },
    clear() {
      try {
        window.localStorage.removeItem(key);
      } catch {
        cachedRaw = null;
        cachedValue = fallback;
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}

/** React binding; the server snapshot is always the fallback (no hydration mismatch). */
export function useLocalStore<T>(store: LocalStore<T>, fallback: T): T {
  return useSyncExternalStore(store.subscribe, store.get, () => fallback);
}
