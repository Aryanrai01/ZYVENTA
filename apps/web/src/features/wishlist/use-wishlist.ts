'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import type { Route } from 'next';
import { toast } from '@/components/feedback/toast';
import { useAuth } from '@/features/auth/use-auth';
import { errorMessage } from '@/features/cart/use-cart';
import { wishlistService } from '@/services/shopper.service';

export const wishlistKeys = {
  all: ['wishlist'] as const,
  ids: ['wishlist', 'ids'] as const,
  list: ['wishlist', 'list'] as const,
};

const EMPTY: string[] = [];

export function useWishlistIds(): string[] {
  const { status } = useAuth();
  const query = useQuery({
    queryKey: wishlistKeys.ids,
    queryFn: wishlistService.ids,
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
  return status === 'authenticated' ? (query.data ?? EMPTY) : EMPTY;
}

export function useWishlist() {
  const { status } = useAuth();
  return useQuery({
    queryKey: wishlistKeys.list,
    queryFn: wishlistService.get,
    enabled: status === 'authenticated',
  });
}

/** Save/unsave with an optimistic heart; visitors are sent to sign in first. */
export function useToggleWishlist() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const mutation = useMutation({
    mutationFn: async ({ productId, saved }: { productId: string; saved: boolean }) =>
      saved ? wishlistService.remove(productId) : wishlistService.add(productId),
    onMutate: async ({ productId, saved }) => {
      await queryClient.cancelQueries({ queryKey: wishlistKeys.ids });
      const previous = queryClient.getQueryData<string[]>(wishlistKeys.ids);
      queryClient.setQueryData<string[]>(wishlistKeys.ids, (ids = []) =>
        saved ? ids.filter((id) => id !== productId) : [productId, ...ids],
      );
      return { previous };
    },
    onSuccess: (ids, { saved }) => {
      queryClient.setQueryData(wishlistKeys.ids, ids);
      void queryClient.invalidateQueries({ queryKey: wishlistKeys.list });
      toast.success(saved ? 'Removed from your wishlist' : 'Saved to your wishlist');
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(wishlistKeys.ids, context?.previous);
      toast.error(errorMessage(error, 'Could not update your wishlist'));
    },
  });

  return {
    toggle: (productId: string, saved: boolean) => {
      if (status !== 'authenticated') {
        router.push(`/login?next=${encodeURIComponent(pathname)}` as Route);
        return;
      }
      mutation.mutate({ productId, saved });
    },
    isPending: mutation.isPending,
  };
}
