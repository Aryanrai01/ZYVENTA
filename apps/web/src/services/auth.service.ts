import type {
  AuthSessionPayload,
  AuthUser,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@zyventa/shared';
import { ApiClientError, apiClient, hasSessionHint } from '@/lib/api-client';

const noRefresh = { skipAuthRefresh: true, cache: 'no-store' as const };

export const authService = {
  /** Current user, or null when signed out. Never throws for "not signed in". */
  async me(): Promise<AuthUser | null> {
    if (!hasSessionHint()) return null; // anonymous visitor: skip the round trip
    try {
      const { data } = await apiClient.get<AuthUser>('/auth/me', { cache: 'no-store' });
      return data;
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
        return null;
      }
      throw error;
    }
  },

  async login(input: LoginInput): Promise<AuthSessionPayload> {
    return (await apiClient.post<AuthSessionPayload>('/auth/login', input, noRefresh)).data;
  },

  async register(input: RegisterInput): Promise<AuthSessionPayload> {
    return (await apiClient.post<AuthSessionPayload>('/auth/register', input, noRefresh)).data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout', undefined, noRefresh);
  },

  async logoutEverywhere(): Promise<void> {
    await apiClient.post('/auth/logout-all');
  },

  async verifyEmail(token: string): Promise<void> {
    await apiClient.post('/auth/verify-email', { token }, noRefresh);
  },

  async resendVerification(): Promise<string> {
    return (await apiClient.post('/auth/resend-verification')).message;
  },

  async forgotPassword(input: ForgotPasswordInput): Promise<string> {
    return (await apiClient.post('/auth/forgot-password', input, noRefresh)).message;
  },

  async resetPassword(input: ResetPasswordInput): Promise<string> {
    return (await apiClient.post('/auth/reset-password', input, noRefresh)).message;
  },

  async changePassword(input: ChangePasswordInput): Promise<string> {
    return (await apiClient.post('/auth/change-password', input)).message;
  },
};
