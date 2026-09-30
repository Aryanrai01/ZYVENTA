import type { AuditResource, TransitionActor } from '@zyventa/shared';
import type { Request } from 'express';
import type { ClientSession } from 'mongoose';
import { logger } from '../../config/logger.js';
import { AuditLog } from './audit-log.model.js';

const SENSITIVE_KEY =
  /pass(word)?|secret|token|signature|authorization|cookie|otp|cvv|card|account_?number/i;
const MAX_DEPTH = 5;

/** Deep-copies metadata, replacing any sensitive-looking key's value with "[REDACTED]". */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if ('toHexString' in value && typeof value.toHexString === 'function') {
      return (value as { toHexString: () => string }).toHexString();
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1),
      ]),
    );
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export interface AuditEntry {
  action: string;
  resource: AuditResource;
  resourceId: string;
  metadata?: Record<string, unknown>;
  /** Defaults to ADMIN when the caller holds the ADMIN role and the route is an admin route. */
  actorRole: TransitionActor;
}

/**
 * Appends an audit record. Inside a transaction pass the session so the log commits (or rolls
 * back) with the change it describes; outside one, failures are logged but never thrown.
 */
export async function recordAudit(
  req: Request | null,
  entry: AuditEntry,
  session?: ClientSession,
): Promise<void> {
  const doc = {
    actor: req?.auth?.userId ?? null,
    actorRole: entry.actorRole,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    metadata: redact(entry.metadata ?? {}),
    ip: req?.ip?.slice(0, 64),
    userAgent: req?.get('user-agent')?.slice(0, 512),
    requestId: typeof req?.id === 'string' ? req.id : undefined,
  };
  if (session) {
    await AuditLog.create([doc], { session });
    return;
  }
  await AuditLog.create(doc).catch((error: unknown) => {
    logger.error({ reason: String(error), action: entry.action }, 'Failed to write audit log');
  });
}
