import { ERROR_CODES, type ApiFieldError, type ErrorCode } from '@zyventa/shared';

/**
 * The only error type services should throw for expected failures. The central error handler
 * converts it into the standard `{ success: false, message, code, errors }` envelope.
 * Anything that is not an ApiError is treated as an unexpected 500.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly errors: ApiFieldError[] | undefined;

  constructor(statusCode: number, code: ErrorCode, message: string, errors?: ApiFieldError[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
  }

  static badRequest(message = 'Bad request', code: ErrorCode = ERROR_CODES.BAD_REQUEST) {
    return new ApiError(400, code, message);
  }

  static validation(errors: ApiFieldError[], message = 'Validation failed') {
    return new ApiError(400, ERROR_CODES.VALIDATION_ERROR, message, errors);
  }

  static unauthenticated(message = 'Authentication required') {
    return new ApiError(401, ERROR_CODES.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found', code: ErrorCode = ERROR_CODES.NOT_FOUND) {
    return new ApiError(404, code, message);
  }

  static conflict(message = 'Resource conflict', code: ErrorCode = ERROR_CODES.CONFLICT) {
    return new ApiError(409, code, message);
  }

  static unprocessable(message: string, code: ErrorCode = ERROR_CODES.UNPROCESSABLE_ENTITY) {
    return new ApiError(422, code, message);
  }

  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new ApiError(429, ERROR_CODES.RATE_LIMITED, message);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new ApiError(503, ERROR_CODES.SERVICE_UNAVAILABLE, message);
  }
}
