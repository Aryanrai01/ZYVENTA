import { IDEMPOTENCY_HEADER, idempotencyKeySchema } from '@zyventa/shared';
import { createHash } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { IdempotencyKey } from '../database/idempotency-key.model.js';
import { ApiError } from '../utils/ApiError.js';

const STALE_AFTER_MS = 2 * 60_000;

/**
 * Makes a POST safe to retry. The first request with a key runs and its JSON response is
 * stored; a retry with the same key and body replays that response; a concurrent duplicate
 * gets 409; the same key with a different body gets 422. Requires `auth.required` first.
 */
export function idempotent(scope: string): RequestHandler {
  return async (req, res, next) => {
    const userId = req.auth?.userId;
    if (!userId) {
      next(ApiError.unauthenticated());
      return;
    }
    const parsed = idempotencyKeySchema.safeParse(req.get(IDEMPOTENCY_HEADER));
    if (!parsed.success) {
      next(ApiError.badRequest(`A unique ${IDEMPOTENCY_HEADER} header is required`));
      return;
    }
    const key = parsed.data;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');

    try {
      await IdempotencyKey.create({ user: userId, scope, key, requestHash });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) {
        next(error);
        return;
      }
      const existing = await IdempotencyKey.findOne({ user: userId, scope, key }).lean();
      if (!existing) {
        next(ApiError.conflict('Please retry the request'));
        return;
      }
      if (existing.requestHash !== requestHash) {
        next(ApiError.unprocessable('This Idempotency-Key was used with a different request'));
        return;
      }
      if (existing.status === 'IN_PROGRESS') {
        // A request that crashed mid-flight must not block retries for 24 hours.
        const stale = Date.now() - existing.createdAt.getTime() > STALE_AFTER_MS;
        if (stale) {
          await IdempotencyKey.deleteOne({ _id: existing._id, status: 'IN_PROGRESS' });
        }
        next(ApiError.conflict('This request is already being processed. Please retry shortly.'));
        return;
      }
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(existing.responseStatus ?? 200).json(existing.responseBody);
      return;
    }

    // Capture the response so a retry can replay it. Failed requests free the key.
    const originalJson = res.json.bind(res) as Response['json'];
    res.json = ((body: unknown) => {
      const status = res.statusCode;
      const done =
        status < 400
          ? IdempotencyKey.updateOne(
              { user: userId, scope, key },
              { $set: { status: 'COMPLETED', responseStatus: status, responseBody: body } },
            )
          : IdempotencyKey.deleteOne({ user: userId, scope, key });
      void done.catch(() => undefined);
      return originalJson(body);
    }) as Response['json'];
    next();
  };
}
