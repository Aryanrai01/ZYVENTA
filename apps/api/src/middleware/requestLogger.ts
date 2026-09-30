import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

const REQUEST_ID_HEADER = 'x-request-id';
/** Accept caller-supplied ids only if they look like opaque tokens (prevents log injection). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const id = typeof inbound === 'string' && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/** Assigns `req.id`, echoes it as `X-Request-Id`, and emits one structured log line per request. */
export const requestLogger = pinoHttp({
  logger,
  genReqId: resolveRequestId,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Health probes run every few seconds; keep them out of the logs.
  autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
  },
});
