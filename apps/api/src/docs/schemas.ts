import './zod-openapi.js';
import { z } from 'zod';
import { ERROR_CODES } from '@zyventa/shared';

/** OpenAPI helpers mirroring the shared response envelope types. */
export function successEnvelope<T extends z.ZodType>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export function paginatedEnvelope<T extends z.ZodType>(item: T) {
  return successEnvelope(z.array(item)).extend({ pagination: paginationMetaSchema });
}

export const errorEnvelope = z.object({
  success: z.literal(false),
  message: z.string(),
  code: z.enum(Object.values(ERROR_CODES) as [string, ...string[]]),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  requestId: z.string().optional(),
});
