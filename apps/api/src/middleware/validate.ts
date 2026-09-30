import type { Request, RequestHandler } from 'express';
import type { ApiFieldError } from '@zyventa/shared';
import type { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';

interface RequestSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/**
 * Validates body / query / params with zod and stores the parsed (coerced, stripped) values
 * on `req.validated`. Controllers read only from `req.validated`, never from raw input, which
 * is what blocks mass-assignment and operator-injection payloads.
 *
 * Use `.strict()` object schemas for bodies so unknown keys are rejected outright.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const errors: ApiFieldError[] = [];
    const validated: Request['validated'] = {};

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          errors.push({
            path: [part, ...issue.path.map(String)].join('.'),
            message: issue.message,
          });
        }
      }
    }

    if (errors.length > 0) {
      next(ApiError.validation(errors));
      return;
    }
    req.validated = validated;
    next();
  };
}
