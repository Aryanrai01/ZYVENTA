'use client';

import type { AuthUser, LoginInput, RegisterInput, Role } from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';

export const authKeys = { me: ['auth', 'me'] as const };

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface UseAuth {
  user: AuthUser | null;
  status: AuthStatus;
  hasRole: (role: Role) => boolean;
  refetch: () => Promise<unknown>;
}

/** The signed-in user (cached; shared by every component that asks). */
export function useAuth(): UseAuth {
  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: () => authService.me(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const user = query.data ?? null;
  const status: AuthStatus = query.isPending ? 'loading' : user ? 'authenticated' : 'anonymous';

  return {
    user,
    status,
    hasRole: (role) => Boolean(user?.roles.includes(role)),
    refetch: () => query.refetch(),
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authService.login(input),
    onSuccess: ({ user }) => {
      // Anything cached for the previous (anonymous) visitor is discarded.
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authService.register(input),
    onSuccess: ({ user }) => {
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope: 'device' | 'everywhere' = 'device') =>
      scope === 'everywhere' ? authService.logoutEverywhere() : authService.logout(),
    onSettled: () => {
      // Drop every cached private query (orders, cart…) so nothing leaks to the next user.
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}
