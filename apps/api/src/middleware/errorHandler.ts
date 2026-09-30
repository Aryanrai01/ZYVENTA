import type { ErrorRequestHandler, RequestHandler } from 'express';
import { mongoose } from '../database/mongoose.js';
import { ERROR_CODES, type ApiErrorResponse, type ApiFieldError } from '@zyventa/shared';
import { isProduction } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/** 404 for any route not matched by the router. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.path} not found`, ERROR_CODES.ROUTE_NOT_FOUND));
};

interface BodyParserError extends Error {
  type?: string;
  status?: number;
  expose?: boolean;
}

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyPattern?: Record<string, unknown>;
}

function isDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
  return error instanceof Error && 'code' in error && (error as { code: unknown }).code === 11000;
}

/**
 * Translates any thrown value into an ApiError. Known library errors are mapped to precise
 * status codes; everything else becomes an opaque 500 so internals never leak to clients.
 */
function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof mongoose.Error.CastError) {
    return new ApiError(400, ERROR_CODES.INVALID_ID, `Invalid value for ${error.path}`);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const errors: ApiFieldError[] = Object.values(error.errors).map((fieldError) => ({
      path: fieldError.path,
      message: fieldError.message,
    }));
    return new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Validation failed', errors);
  }

  if (isDuplicateKeyError(error)) {
    // Report which field collided, never the colliding value (could be an email or token).
    const fields = Object.keys(error.keyPattern ?? {});
    return new ApiError(
      409,
      ERROR_CODES.DUPLICATE_KEY,
      fields.length > 0
        ? `A record with this ${fields.join(', ')} already exists`
        : 'Duplicate record',
    );
  }

  // multer (file uploads)
  if (error instanceof Error && error.name === 'MulterError') {
    const code = (error as Error & { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      return new ApiError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'Each image must be 5 MB or smaller');
    }
    if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
      return new ApiError(
        400,
        ERROR_CODES.BAD_REQUEST,
        'Upload up to 8 images in the "images" field',
      );
    }
    return new ApiError(400, ERROR_CODES.BAD_REQUEST, 'Invalid upload');
  }

  const parserError = error as BodyParserError;
  if (parserError.type === 'entity.too.large') {
    return new ApiError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'Request body is too large');
  }
  if (parserError.type === 'entity.parse.failed') {
    return new ApiError(400, ERROR_CODES.BAD_REQUEST, 'Malformed JSON body');
  }
  if (
    parserError.expose === true &&
    typeof parserError.status === 'number' &&
    parserError.status >= 400 &&
    parserError.status < 500
  ) {
    return new ApiError(parserError.status, ERROR_CODES.BAD_REQUEST, parserError.message);
  }

  return new ApiError(500, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong. Please try again.');
}

/** Central error handler — must be registered last. */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const apiError = normalizeError(error);

  if (apiError.statusCode >= 500) {
    req.log.error({ err: error }, 'Unhandled error');
  } else {
    req.log.debug({ code: apiError.code, message: apiError.message }, 'Request rejected');
  }

  if (apiError.statusCode === 429) {
    res.setHeader('Cache-Control', 'no-store');
  }

  const body: ApiErrorResponse & { stack?: string } = {
    success: false,
    message: apiError.message,
    code: apiError.code,
    ...(apiError.errors ? { errors: apiError.errors } : {}),
    ...(typeof req.id === 'string' ? { requestId: req.id } : {}),
    ...(!isProduction && apiError.statusCode >= 500 && error instanceof Error && error.stack
      ? { stack: error.stack }
      : {}),
  };

  res.status(apiError.statusCode).json(body);
};
