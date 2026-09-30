import { z } from 'zod';
import type { Role, UserStatus } from '../constants/roles.js';
import type { SellerStatus } from '../constants/statuses.js';
import {
  PASSWORD_MAX_LENGTH,
  emailSchema,
  indianMobileSchema,
  passwordSchema,
} from '../validation/fields.js';

/** Cookie and header names shared by the API (sets them) and the web app (reads the CSRF one). */
export const AUTH_COOKIES = {
  accessToken: 'zv_at',
  refreshToken: 'zv_rt',
  csrf: 'zv_csrf',
  /** Non-secret "a session exists" hint so the web proxy can redirect before rendering. */
  sessionHint: 'zv_session',
} as const;
export const CSRF_HEADER = 'X-CSRF-Token';

/** Opaque single-use tokens (refresh, email verification, reset) are 32 random bytes, base64url. */
const opaqueTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'This link is invalid or incomplete');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(80),
    email: emailSchema,
    password: passwordSchema,
    phone: indianMobileSchema.optional(),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: emailSchema,
    // No policy checks on login: legacy passwords must still be accepted.
    password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ token: opaqueTokenSchema, password: passwordSchema })
  .strict();
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: opaqueTokenSchema }).strict();
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** The signed-in user as exposed to clients. Never contains security bookkeeping. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: Role[];
  status: UserStatus;
  emailVerified: boolean;
  avatarUrl: string | null;
  seller: { id: string; storeName: string; status: SellerStatus } | null;
  createdAt: string;
}

export interface AuthSessionPayload {
  user: AuthUser;
  /** Seconds until the access token expires — clients refresh shortly before. */
  accessTokenExpiresIn: number;
}

export interface CsrfPayload {
  csrfToken: string;
}
