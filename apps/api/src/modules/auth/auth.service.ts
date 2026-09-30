import {
  ERROR_CODES,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@zyventa/shared';
import type { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendEmailInBackground } from '../email/mailer.js';
import { passwordChangedEmail, passwordResetEmail, verificationEmail } from '../email/templates.js';
import { Notification } from '../notifications/notification.model.js';
import { toAuthUser } from '../users/user.mapper.js';
import { User } from '../users/user.model.js';
import { AuthToken } from './auth-token.model.js';
import { getDummyHash, hashPassword, needsRehash, verifyPassword } from './password.js';
import type { ClientMeta, IssuedSession, SessionService } from './session.service.js';
import { generateOpaqueToken, hashToken } from './tokens.js';

export const LOCKOUT = {
  /** Failed attempts before the account is temporarily locked. */
  threshold: 5,
  baseMinutes: 15,
  maxMinutes: 24 * 60,
} as const;

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Lock duration doubles for every failure past the threshold: 15 m, 30 m, 1 h … capped at 24 h. */
export function lockDurationMs(failedCount: number): number {
  if (failedCount < LOCKOUT.threshold) return 0;
  const minutes = Math.min(
    LOCKOUT.baseMinutes * 2 ** (failedCount - LOCKOUT.threshold),
    LOCKOUT.maxMinutes,
  );
  return minutes * 60 * 1000;
}

export interface AuthResult {
  user: AuthUser;
  session: IssuedSession;
}

const invalidCredentials = () =>
  new ApiError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Incorrect email or password');

export function createAuthService(deps: { sessions: SessionService }) {
  const { sessions } = deps;

  async function issueEmailToken(
    userId: Types.ObjectId,
    type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
    ttlMs: number,
  ): Promise<string> {
    // Older unused tokens of the same type stop working the moment a new one is issued.
    await AuthToken.updateMany(
      { user: userId, type, usedAt: null },
      { $set: { usedAt: new Date() } },
    );
    const token = generateOpaqueToken();
    await AuthToken.create({
      user: userId,
      type,
      tokenHash: hashToken(token, type === 'PASSWORD_RESET' ? 'reset' : 'email'),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return token;
  }

  /** Atomically marks a token used; returns its user id or throws if invalid/expired/used. */
  async function consumeEmailToken(
    token: string,
    type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  ): Promise<Types.ObjectId> {
    const consumed = await AuthToken.findOneAndUpdate(
      {
        tokenHash: hashToken(token, type === 'PASSWORD_RESET' ? 'reset' : 'email'),
        type,
        usedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: new Date() } },
    ).lean();
    if (!consumed) {
      throw ApiError.badRequest(
        'This link is invalid or has expired. Request a new one.',
        ERROR_CODES.TOKEN_INVALID,
      );
    }
    return consumed.user;
  }

  async function sendVerification(user: { _id: Types.ObjectId; email: string; name: string }) {
    const token = await issueEmailToken(user._id, 'EMAIL_VERIFICATION', EMAIL_TOKEN_TTL_MS);
    const url = `${env.WEB_APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    sendEmailInBackground(verificationEmail(user.email, user.name, url));
  }

  return {
    async register(input: RegisterInput, meta: ClientMeta): Promise<AuthResult> {
      if (await User.exists({ email: input.email })) {
        throw ApiError.conflict(
          'An account with this email already exists. Try signing in.',
          ERROR_CODES.EMAIL_ALREADY_REGISTERED,
        );
      }
      const user = await User.create({
        name: input.name,
        email: input.email,
        ...(input.phone ? { phone: input.phone } : {}),
        passwordHash: await hashPassword(input.password),
        // roles/status come from schema defaults — never from the request.
      }).catch((error: unknown) => {
        // Lost a race with a concurrent registration of the same email.
        if ((error as { code?: number }).code === 11000) {
          throw ApiError.conflict(
            'An account with this email already exists. Try signing in.',
            ERROR_CODES.EMAIL_ALREADY_REGISTERED,
          );
        }
        throw error;
      });

      await sendVerification(user);
      const session = await sessions.start(user._id, meta);
      return { user: await toAuthUser(user), session };
    },

    async login(input: LoginInput, meta: ClientMeta): Promise<AuthResult> {
      const user = await User.findOne({ email: input.email }).select(
        '+passwordHash +failedLoginCount +lockUntil',
      );

      if (!user || user.status === 'DELETED') {
        await verifyPassword(await getDummyHash(), input.password); // equalise timing
        throw invalidCredentials();
      }

      if (user.lockUntil && user.lockUntil > new Date()) {
        const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60_000);
        throw new ApiError(
          423,
          ERROR_CODES.ACCOUNT_LOCKED,
          `Too many failed attempts. Try again in ${String(minutes)} minute${minutes === 1 ? '' : 's'} or reset your password.`,
        );
      }

      if (!(await verifyPassword(user.passwordHash, input.password))) {
        const updated = await User.findByIdAndUpdate(
          user._id,
          { $inc: { failedLoginCount: 1 } },
          { returnDocument: 'after' },
        )
          .select('+failedLoginCount')
          .lean();
        const lockMs = lockDurationMs(updated?.failedLoginCount ?? 0);
        if (lockMs > 0) {
          await User.updateOne(
            { _id: user._id },
            { $set: { lockUntil: new Date(Date.now() + lockMs) } },
          );
        }
        throw invalidCredentials();
      }

      if (user.status === 'SUSPENDED') {
        throw new ApiError(403, ERROR_CODES.ACCOUNT_SUSPENDED, 'This account has been suspended');
      }

      const update: Record<string, unknown> = {
        failedLoginCount: 0,
        lockUntil: null,
        lastLoginAt: new Date(),
      };
      if (needsRehash(user.passwordHash)) {
        update.passwordHash = await hashPassword(input.password);
      }
      await User.updateOne({ _id: user._id }, { $set: update });

      const session = await sessions.start(user._id, meta);
      return { user: await toAuthUser(user), session };
    },

    refresh(refreshToken: string, meta: ClientMeta): Promise<IssuedSession> {
      return sessions.rotate(refreshToken, meta);
    },

    async me(userId: string): Promise<AuthUser> {
      const user = await User.findById(userId);
      if (!user) throw ApiError.unauthenticated();
      return toAuthUser(user);
    },

    async verifyEmail(token: string): Promise<void> {
      const userId = await consumeEmailToken(token, 'EMAIL_VERIFICATION');
      await User.updateOne(
        { _id: userId, emailVerifiedAt: null },
        { $set: { emailVerifiedAt: new Date() } },
      );
    },

    async resendVerification(userId: string): Promise<void> {
      const user = await User.findById(userId).select('email name emailVerifiedAt').lean();
      if (!user) throw ApiError.unauthenticated();
      if (user.emailVerifiedAt) {
        throw ApiError.badRequest('Your email address is already verified');
      }
      await sendVerification(user);
    },

    /**
     * Always resolves the same way whether or not the email exists (no account enumeration).
     * The token is created and the email sent without the caller waiting on either.
     */
    requestPasswordReset(email: string): void {
      void (async () => {
        const user = await User.findOne({ email, status: 'ACTIVE' }).select('email name').lean();
        if (!user) return;
        const token = await issueEmailToken(user._id, 'PASSWORD_RESET', RESET_TOKEN_TTL_MS);
        const url = `${env.WEB_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
        sendEmailInBackground(passwordResetEmail(user.email, user.name, url));
      })().catch(() => undefined);
    },

    async resetPassword(input: ResetPasswordInput): Promise<void> {
      const userId = await consumeEmailToken(input.token, 'PASSWORD_RESET');
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            passwordHash: await hashPassword(input.password),
            passwordChangedAt: new Date(),
            failedLoginCount: 0,
            lockUntil: null,
            // Proving control of the inbox also verifies the address.
            emailVerifiedAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      ).lean();
      if (!user) throw ApiError.badRequest('This link is invalid or has expired.');

      await sessions.endAllForUser(userId, 'PASSWORD_CHANGED');
      await notifyPasswordChanged(user);
    },

    async changePassword(
      userId: string,
      sessionId: string,
      input: ChangePasswordInput,
    ): Promise<void> {
      const user = await User.findById(userId).select('+passwordHash email name');
      if (!user) throw ApiError.unauthenticated();
      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new ApiError(
          400,
          ERROR_CODES.INVALID_CREDENTIALS,
          'Your current password is incorrect',
        );
      }
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordHash: await hashPassword(input.newPassword),
            passwordChangedAt: new Date(),
          },
        },
      );
      // Sign out every other device; keep the one that made the change.
      await sessions.endAllForUser(user._id, 'PASSWORD_CHANGED', sessionId);
      await notifyPasswordChanged(user);
    },

    logoutByRefreshToken(refreshToken: string): Promise<void> {
      return sessions.endByRefreshToken(refreshToken);
    },

    logoutEverywhere(userId: string): Promise<void> {
      return sessions.endAllForUser(userId, 'LOGOUT_ALL');
    },
  };

  async function notifyPasswordChanged(user: { _id: Types.ObjectId; email: string; name: string }) {
    await Notification.create({
      user: user._id,
      type: 'SECURITY_ALERT',
      title: 'Your password was changed',
      body: 'If this was not you, reset your password immediately.',
      link: '/forgot-password',
    }).catch(() => undefined);
    sendEmailInBackground(
      passwordChangedEmail(user.email, user.name, `${env.WEB_APP_URL}/forgot-password`),
    );
  }
}

export type AuthService = ReturnType<typeof createAuthService>;
