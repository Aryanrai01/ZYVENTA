import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@zyventa/shared';
import type { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { Notification } from '../notifications/notification.model.js';
import { Session } from './session.model.js';
import { generateOpaqueToken, hashToken, signAccessToken } from './tokens.js';

/** A rotated token presented again within this window is a benign race (two tabs), not theft. */
export const ROTATION_GRACE_MS = 30_000;

export interface ClientMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface IssuedSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  familyId: string;
}

type RevokeReason =
  'LOGOUT' | 'LOGOUT_ALL' | 'REUSE_DETECTED' | 'PASSWORD_CHANGED' | 'SUSPENDED' | 'ADMIN';

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function metaFields(meta: ClientMeta) {
  return {
    ip: meta.ip?.slice(0, 64),
    userAgent: meta.userAgent?.slice(0, 512),
  };
}

export function createSessionService() {
  async function issue(
    userId: Types.ObjectId | string,
    familyId: string,
    meta: ClientMeta,
    expiresAt: Date,
  ): Promise<IssuedSession> {
    const refreshToken = generateOpaqueToken();
    await Session.create({
      user: userId,
      familyId,
      tokenHash: hashToken(refreshToken, 'refresh'),
      expiresAt,
      ...metaFields(meta),
    });
    const accessToken = await signAccessToken({ sub: userId.toString(), sid: familyId });
    return {
      userId: userId.toString(),
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt,
      familyId,
    };
  }

  async function revokeFamilies(
    filter: Record<string, unknown>,
    reason: RevokeReason,
  ): Promise<void> {
    await Session.updateMany(
      { ...filter, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    );
  }

  return {
    /** New login: new session family, 30-day absolute lifetime. */
    start(userId: Types.ObjectId | string, meta: ClientMeta): Promise<IssuedSession> {
      return issue(userId, randomUUID(), meta, refreshExpiry());
    },

    /**
     * Exchanges a refresh token for a new pair. The old row is revoked with a conditional
     * update, so two concurrent refreshes cannot both succeed. Replaying an already-rotated
     * token outside the grace window revokes the whole family and alerts the user.
     * The family keeps its ORIGINAL expiry — rotation never extends a session indefinitely.
     */
    async rotate(refreshToken: string, meta: ClientMeta): Promise<IssuedSession> {
      const tokenHash = hashToken(refreshToken, 'refresh');
      const now = new Date();

      const current = await Session.findOneAndUpdate(
        { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { revokedAt: now, revokedReason: 'ROTATED', lastUsedAt: now } },
        { returnDocument: 'before' },
      ).lean();

      if (current) {
        const next = await issue(current.user, current.familyId, meta, current.expiresAt);
        await Session.updateOne(
          { _id: current._id },
          { $set: { replacedByHash: hashToken(next.refreshToken, 'refresh') } },
        );
        return next;
      }

      const stale = await Session.findOne({ tokenHash }).lean();
      if (!stale) throw new ApiError(401, ERROR_CODES.TOKEN_INVALID, 'Please sign in again');

      const rotatedRecently =
        stale.revokedReason === 'ROTATED' &&
        stale.revokedAt != null &&
        now.getTime() - stale.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (rotatedRecently) {
        // Another tab won the race; the browser already holds the new cookie.
        throw new ApiError(401, ERROR_CODES.TOKEN_INVALID, 'Session was refreshed elsewhere');
      }

      if (stale.revokedReason === 'ROTATED') {
        logger.warn(
          { userId: stale.user.toString() },
          'Refresh token reuse detected; revoking family',
        );
        await revokeFamilies({ familyId: stale.familyId }, 'REUSE_DETECTED');
        await Notification.create({
          user: stale.user,
          type: 'SECURITY_ALERT',
          title: 'We signed you out for your security',
          body: 'An old sign-in token was reused. If this was not you, change your password.',
          link: '/account/security',
        }).catch(() => undefined);
        throw new ApiError(401, ERROR_CODES.TOKEN_REUSED, 'Please sign in again');
      }

      throw new ApiError(401, ERROR_CODES.TOKEN_INVALID, 'Please sign in again');
    },

    /** Revokes the family owning this refresh token (logout on this device). */
    async endByRefreshToken(refreshToken: string): Promise<void> {
      const session = await Session.findOne({ tokenHash: hashToken(refreshToken, 'refresh') })
        .select('familyId')
        .lean();
      if (session) await revokeFamilies({ familyId: session.familyId }, 'LOGOUT');
    },

    endFamily(familyId: string, reason: RevokeReason = 'LOGOUT'): Promise<void> {
      return revokeFamilies({ familyId }, reason);
    },

    /** Revokes every session of a user, optionally keeping the caller's current one. */
    endAllForUser(
      userId: Types.ObjectId | string,
      reason: RevokeReason,
      exceptFamilyId?: string,
    ): Promise<void> {
      return revokeFamilies(
        { user: userId, ...(exceptFamilyId ? { familyId: { $ne: exceptFamilyId } } : {}) },
        reason,
      );
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
