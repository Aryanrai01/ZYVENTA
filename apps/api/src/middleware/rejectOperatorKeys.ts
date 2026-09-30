import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError.js';

const MAX_DEPTH = 12;

/** Returns the dotted path of the first key that could act as a MongoDB operator or path. */
function findIllegalKey(value: unknown, path: string, depth: number): string | null {
  if (depth > MAX_DEPTH) return path || '(root)';
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findIllegalKey(item, `${path}.${String(index)}`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (key.startsWith('$') || key.includes('.') || key === '__proto__') return childPath;
      const found = findIllegalKey(child, childPath, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * NoSQL-injection guard at the HTTP boundary: rejects any request whose body, query or params
 * contain keys starting with `$` (operators like `$ne`, `$where`), containing `.` (nested path
 * injection) or `__proto__` (prototype pollution).
 *
 * Why here and not Mongoose `sanitizeFilter`: that option also neutralises operators our own
 * services build (`$in`, `$gte` …) unless each is wrapped in `trusted()`, turning a forgotten
 * wrapper into a query that silently matches nothing. Rejecting hostile keys at the edge —
 * plus strict zod schemas that only accept primitives where primitives are expected — gives
 * the same protection without that failure mode.
 */
export const rejectOperatorKeys: RequestHandler = (req, _res, next) => {
  const illegal =
    findIllegalKey(req.body, 'body', 0) ??
    findIllegalKey(req.query, 'query', 0) ??
    findIllegalKey(req.params, 'params', 0);

  if (illegal) {
    next(
      ApiError.validation([{ path: illegal, message: 'Field names may not contain "$" or "."' }]),
    );
    return;
  }
  next();
};
