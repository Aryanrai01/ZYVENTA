import type { Response } from 'express';
import type { ApiSuccessResponse, PaginationMeta } from '@zyventa/shared';

interface SendSuccessOptions<T> {
  data: T;
  message?: string;
  statusCode?: number;
  pagination?: PaginationMeta;
}

/** Sends the standard success envelope. Controllers never call `res.json` directly. */
export function sendSuccess<T>(res: Response, options: SendSuccessOptions<T>): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    message: options.message ?? 'OK',
    data: options.data,
    ...(options.pagination ? { pagination: options.pagination } : {}),
  };
  res.status(options.statusCode ?? 200).json(body);
}
