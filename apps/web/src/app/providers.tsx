'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from '@/components/feedback/toast';
import { authKeys } from '@/features/auth/use-auth';
import { CartSync } from '@/features/cart/use-cart';
import { onSessionExpired } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  // When a token refresh fails, the session is over: forget the user and private data.
  useEffect(
    () =>
      onSessionExpired(() => {
        queryClient.clear();
        queryClient.setQueryData(authKeys.me, null);
      }),
    [queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <CartSync />
      <Toaster />
    </QueryClientProvider>
  );
}
