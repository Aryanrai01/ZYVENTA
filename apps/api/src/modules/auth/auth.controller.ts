import {
  AUTH_COOKIES,
  type AuthSessionPayload,
  type ChangePasswordInput,
  type CsrfPayload,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from '@zyventa/shared';
import type { Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { authOf } from '../../middleware/authenticate.js';
import { issueCsrfToken, isValidCsrfToken } from '../../middleware/csrf.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import type { AuthService } from './auth.service.js';
import { clearSessionCookies, setCsrfCookie, setSessionCookies } from './cookies.js';
import type { ClientMeta, IssuedSession } from './session.service.js';

function clientMeta(req: Request): ClientMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
    AUTH_COOKIES.refreshToken
  ];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function startSession(res: Response, session: IssuedSession, rotateCsrf = false): void {
  setSessionCookies(res, session);
  // New CSRF token whenever the authentication state changes (login/register).
  if (rotateCsrf) setCsrfCookie(res, issueCsrfToken());
  res.setHeader('Cache-Control', 'no-store');
}

export function createAuthController(auth: AuthService) {
  const handlers = {
    csrf: ((req, res) => {
      const existing: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
        AUTH_COOKIES.csrf
      ];
      let token: string;
      if (typeof existing === 'string' && isValidCsrfToken(existing)) {
        token = existing;
      } else {
        token = issueCsrfToken();
        setCsrfCookie(res, token);
      }
      res.setHeader('Cache-Control', 'no-store');
      sendSuccess<CsrfPayload>(res, { data: { csrfToken: token } });
    }) satisfies RequestHandler,

    register: (async (req, res) => {
      const { user, session } = await auth.register(
        req.validated.body as RegisterInput,
        clientMeta(req),
      );
      startSession(res, session, true);
      sendSuccess<AuthSessionPayload>(res, {
        statusCode: 201,
        message: 'Account created. Check your inbox to confirm your email.',
        data: { user, accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
      });
    }) satisfies RequestHandler,

    login: (async (req, res) => {
      const { user, session } = await auth.login(req.validated.body as LoginInput, clientMeta(req));
      startSession(res, session, true);
      sendSuccess<AuthSessionPayload>(res, {
        message: 'Signed in',
        data: { user, accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
      });
    }) satisfies RequestHandler,

    refresh: (async (req, res) => {
      const refreshToken = readRefreshCookie(req);
      if (!refreshToken) {
        clearSessionCookies(res);
        throw ApiError.unauthenticated('Please sign in again');
      }
      try {
        const session = await auth.refresh(refreshToken, clientMeta(req));
        startSession(res, session);
        sendSuccess(res, {
          message: 'Session refreshed',
          data: { accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
        });
      } catch (error) {
        clearSessionCookies(res);
        throw error;
      }
    }) satisfies RequestHandler,

    logout: (async (req, res) => {
      const refreshToken = readRefreshCookie(req);
      if (refreshToken) await auth.logoutByRefreshToken(refreshToken);
      clearSessionCookies(res);
      res.setHeader('Cache-Control', 'no-store');
      sendSuccess(res, { message: 'Signed out', data: null });
    }) satisfies RequestHandler,

    logoutAll: (async (req, res) => {
      await auth.logoutEverywhere(authOf(req).userId);
      clearSessionCookies(res);
      sendSuccess(res, { message: 'Signed out on all devices', data: null });
    }) satisfies RequestHandler,

    me: (async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      sendSuccess(res, { data: await auth.me(authOf(req).userId) });
    }) satisfies RequestHandler,

    verifyEmail: (async (req, res) => {
      await auth.verifyEmail((req.validated.body as VerifyEmailInput).token);
      sendSuccess(res, { message: 'Email verified', data: null });
    }) satisfies RequestHandler,

    resendVerification: (async (req, res) => {
      await auth.resendVerification(authOf(req).userId);
      sendSuccess(res, { message: 'Verification email sent', data: null });
    }) satisfies RequestHandler,

    forgotPassword: ((req, res) => {
      auth.requestPasswordReset((req.validated.body as ForgotPasswordInput).email);
      // Identical response whether or not the account exists.
      sendSuccess(res, {
        statusCode: 202,
        message: 'If an account exists for that email, a reset link is on its way.',
        data: null,
      });
    }) satisfies RequestHandler,

    resetPassword: (async (req, res) => {
      await auth.resetPassword(req.validated.body as ResetPasswordInput);
      clearSessionCookies(res);
      sendSuccess(res, {
        message: 'Password updated. Sign in with your new password.',
        data: null,
      });
    }) satisfies RequestHandler,

    changePassword: (async (req, res) => {
      const principal = authOf(req);
      await auth.changePassword(
        principal.userId,
        principal.sessionId,
        req.validated.body as ChangePasswordInput,
      );
      sendSuccess(res, { message: 'Password changed. Other devices were signed out.', data: null });
    }) satisfies RequestHandler,
  };
  return handlers;
}
