import type { Route } from 'next';

/**
 * Returns `target` only if it is a same-site relative path; otherwise `fallback`.
 * Prevents open redirects via `/login?next=https://evil.example` or `//evil.example`.
 */
export function safeRedirectPath(target: string | null | undefined, fallback = '/'): Route {
  // Validated internal paths are cast to Next's typed-route type at this single boundary.
  const safe = fallback as Route;
  if (!target) return safe;
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return safe;
  if (/[\u0000-\u001f]/.test(target)) return safe;
  try {
    const url = new URL(target, 'http://internal.invalid');
    if (url.origin !== 'http://internal.invalid') return safe;
    return `${url.pathname}${url.search}${url.hash}` as Route;
  } catch {
    return safe;
  }
}
