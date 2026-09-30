import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  ROLES,
  USER_STATUSES,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@zyventa/shared';
import { z } from 'zod';
import { errorEnvelope, successEnvelope } from '../../docs/schemas.js';

const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  phone: z.string().nullable(),
  roles: z.array(z.enum(ROLES)),
  status: z.enum(USER_STATUSES),
  emailVerified: z.boolean(),
  avatarUrl: z.string().nullable(),
  seller: z.object({ id: z.string(), storeName: z.string(), status: z.string() }).nullable(),
  createdAt: z.string(),
});

const sessionPayload = successEnvelope(
  z.object({ user: authUserSchema, accessTokenExpiresIn: z.number().int() }),
);
const emptyPayload = successEnvelope(z.null());
const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const error = (description: string) => ({ description, ...json(errorEnvelope) });

const csrfNote = `State-changing requests must send the \`${CSRF_HEADER}\` header equal to the \`${AUTH_COOKIES.csrf}\` cookie (obtain via GET /auth/csrf).`;

export function registerAuthDocs(registry: OpenAPIRegistry): void {
  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: AUTH_COOKIES.accessToken,
    description: 'Short-lived access JWT set by login/register/refresh (HttpOnly).',
  });
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Alternative for non-browser clients; exempt from CSRF when no cookies are sent.',
  });

  const secured: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }];
  const tags = ['Auth'];

  registry.registerPath({
    method: 'get',
    path: '/auth/csrf',
    tags,
    summary: 'Get (and set) the CSRF token',
    responses: {
      200: { description: 'Token', ...json(successEnvelope(z.object({ csrfToken: z.string() }))) },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/register',
    tags,
    summary: 'Create a customer account and sign in',
    description: `Sets session cookies and emails a verification link. ${csrfNote}`,
    request: { body: json(registerSchema) },
    responses: {
      201: { description: 'Created', ...json(sessionPayload) },
      400: error('Validation failed'),
      403: error('CSRF check failed'),
      409: error('Email already registered'),
      429: error('Too many attempts'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    tags,
    summary: 'Sign in with email and password',
    description: csrfNote,
    request: { body: json(loginSchema) },
    responses: {
      200: { description: 'Signed in', ...json(sessionPayload) },
      401: error('Incorrect email or password'),
      403: error('Account suspended / CSRF failed'),
      423: error('Temporarily locked after repeated failures'),
      429: error('Too many attempts'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/refresh',
    tags,
    summary: 'Rotate the refresh token and issue a new access token',
    description: `Uses the \`${AUTH_COOKIES.refreshToken}\` cookie. Reuse of a rotated token revokes all sessions in its family.`,
    responses: {
      200: {
        description: 'Refreshed',
        ...json(successEnvelope(z.object({ accessTokenExpiresIn: z.number() }))),
      },
      401: error('Refresh token missing, expired, revoked or reused'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    tags,
    summary: 'Sign out on this device',
    responses: { 200: { description: 'Signed out', ...json(emptyPayload) } },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/logout-all',
    tags,
    security: secured,
    summary: 'Sign out on every device',
    responses: {
      200: { description: 'Signed out', ...json(emptyPayload) },
      401: error('Not signed in'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/auth/me',
    tags,
    security: secured,
    summary: 'Current user',
    responses: {
      200: { description: 'User', ...json(successEnvelope(authUserSchema)) },
      401: error('Not signed in / token expired (code TOKEN_EXPIRED → call /auth/refresh)'),
      403: error('Account suspended'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/verify-email',
    tags,
    summary: 'Confirm an email address with the emailed token',
    request: { body: json(verifyEmailSchema) },
    responses: {
      200: { description: 'Verified', ...json(emptyPayload) },
      400: error('Invalid or expired link'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/resend-verification',
    tags,
    security: secured,
    summary: 'Send a new verification email',
    responses: {
      200: { description: 'Sent', ...json(emptyPayload) },
      400: error('Already verified'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/forgot-password',
    tags,
    summary: 'Request a password-reset email',
    description: 'Always returns 202, whether or not the account exists.',
    request: { body: json(forgotPasswordSchema) },
    responses: { 202: { description: 'Accepted', ...json(emptyPayload) } },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/reset-password',
    tags,
    summary: 'Set a new password with the emailed token',
    description: 'Signs out every device.',
    request: { body: json(resetPasswordSchema) },
    responses: {
      200: { description: 'Updated', ...json(emptyPayload) },
      400: error('Invalid or expired link'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/change-password',
    tags,
    security: secured,
    summary: 'Change password (signed in)',
    description: 'Signs out every other device.',
    request: { body: json(changePasswordSchema) },
    responses: {
      200: { description: 'Changed', ...json(emptyPayload) },
      400: error('Current password incorrect / validation failed'),
    },
  });
}
