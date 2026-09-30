import type { ErrorCode } from '../errors/codes.js';

/** Metadata attached to every paginated list response. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  pagination?: PaginationMeta;
}

export interface ApiFieldError {
  /** Dot-path of the offending field, e.g. `body.items.0.qty`. */
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code: ErrorCode;
  errors?: ApiFieldError[];
  /** Correlation id — quote it when reporting a problem. */
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedResponse<T> extends ApiSuccessResponse<T[]> {
  pagination: PaginationMeta;
}

/** Response body of `GET /api/v1/health/ready`. */
export interface ReadinessReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  version: string;
  checks: Record<'mongodb', 'up' | 'down'>;
}
