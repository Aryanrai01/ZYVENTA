'use client';

import type { CartView } from '@zyventa/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from '@/components/feedback/toast';
import { useAuth } from '@/features/auth/use-auth';
import { ApiClientError } from '@/lib/api-client';
import { useLocalStore } from '@/lib/local-store';
import { cartService } from '@/services/shopper.service';
import {
  EMPTY_LINES,
  addGuestLine,
  guestCart,
  removeGuestLine,
  setGuestQuantity,
} from './guest-cart';

export const cartKeys = {
  all: ['cart'] as const,
  account: ['cart', 'account'] as const,
  guest: (lines: unknown) => ['cart', 'guest', lines] as const,
};

export const EMPTY_CART: CartView = {
  items: [],
  shipments: [],
  summary: {
    itemCount: 0,
    subtotal: 0,
    mrpTotal: 0,
    savings: 0,
    shippingFee: 0,
    total: 0,
    freeShippingThreshold: 0,
  },
  hasIssues: false,
};

export const errorMessage = (error: unknown, fallback = 'Something went wrong') =>
  error instanceof ApiClientError ? error.message : fallback;

/**
 * The shopper's cart, always priced by the API: the account cart when signed in, otherwise a
 * preview of the guest lines stored in this browser.
 */
export function useCart() {
  const { status } = useAuth();
  const lines = useLocalStore(guestCart, EMPTY_LINES);
  const signedIn = status === 'authenticated';
  const guestMode = status === 'anonymous';

  const account = useQuery({
    queryKey: cartKeys.account,
    queryFn: cartService.get,
    enabled: signedIn,
    staleTime: 15_000,
  });
  const guest = useQuery({
    queryKey: cartKeys.guest(lines),
    queryFn: () => cartService.preview(lines),
    enabled: guestMode && lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  let cart: CartView | undefined;
  if (signedIn) cart = account.data;
  else if (guestMode) cart = lines.length > 0 ? guest.data : EMPTY_CART;

  const active = signedIn ? account : guest;
  return {
    cart,
    mode: signedIn ? ('account' as const) : ('guest' as const),
    isLoading: status === 'loading' || cart === undefined,
    isFetching: active.isFetching,
    error: active.error,
    refetch: () => active.refetch(),
  };
}

/** Units in the cart for the header badge — no network call for guests. */
export function useCartCount(): number {
  const { status } = useAuth();
  const lines = useLocalStore(guestCart, EMPTY_LINES);
  const account = useQuery({
    queryKey: cartKeys.account,
    queryFn: cartService.get,
    enabled: status === 'authenticated',
    staleTime: 15_000,
  });
  if (status === 'authenticated') {
    return account.data?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  }
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function useCartActions() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = status === 'authenticated';

  const onAccountSuccess = (view: CartView) => {
    queryClient.setQueryData(cartKeys.account, view);
  };
  const onError = (error: unknown) => {
    toast.error(errorMessage(error, 'Could not update your cart'));
    // Stock or price may have moved: show the truth.
    void queryClient.invalidateQueries({ queryKey: cartKeys.all });
  };

  const add = useMutation({
    mutationFn: async (input: { variantId: string; quantity: number; maxQuantity?: number }) => {
      if (signedIn) {
        onAccountSuccess(
          await cartService.add({ variantId: input.variantId, quantity: input.quantity }),
        );
      } else {
        guestCart.set((lines) =>
          addGuestLine(lines, input.variantId, input.quantity, input.maxQuantity),
        );
      }
    },
    onError,
  });

  const setQuantity = useMutation({
    mutationFn: async (input: { variantId: string; quantity: number }) => {
      if (signedIn)
        onAccountSuccess(await cartService.setQuantity(input.variantId, input.quantity));
      else guestCart.set((lines) => setGuestQuantity(lines, input.variantId, input.quantity));
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: async (variantId: string) => {
      if (signedIn) onAccountSuccess(await cartService.remove(variantId));
      else guestCart.set((lines) => removeGuestLine(lines, variantId));
    },
    onError,
  });

  return { add, setQuantity, remove };
}

/**
 * After sign-in, folds the guest cart into the account cart once, then clears it locally.
 * Mounted once in the app providers.
 */
export function CartSync() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const lines = useLocalStore(guestCart, EMPTY_LINES);
  const merging = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || lines.length === 0 || merging.current) return;
    merging.current = true;
    cartService
      .merge(lines)
      .then((view) => {
        guestCart.clear();
        queryClient.setQueryData(cartKeys.account, view);
      })
      .catch(() => {
        // Keep the guest lines; a later visit retries the merge.
      })
      .finally(() => {
        merging.current = false;
      });
  }, [status, lines, queryClient]);

  return null;
}
