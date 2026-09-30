'use client';

import { Heart } from 'lucide-react';
import Link from 'next/link';
import { ProductCard, ProductCardSkeleton } from '@/components/catalog/product-card';
import { EmptyState } from '@/components/feedback/empty-state';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/use-auth';
import { errorMessage } from '@/features/cart/use-cart';
import { useWishlist, useWishlistIds } from '../use-wishlist';

export function WishlistView() {
  const { status } = useAuth();
  const wishlist = useWishlist();
  // Hide items the moment they are un-hearted (optimistic), before the list refetches.
  const savedIds = useWishlistIds();

  if (status === 'anonymous') {
    return (
      <EmptyState
        icon={Heart}
        title="Save items you love"
        description="Sign in to keep a wishlist across all your devices."
        action={
          <Button asChild>
            <Link href="/login?next=%2Fwishlist">Sign in</Link>
          </Button>
        }
      />
    );
  }
  if (wishlist.error) {
    return (
      <Alert variant="error" title="We couldn’t load your wishlist">
        {errorMessage(wishlist.error)}
      </Alert>
    );
  }
  if (status === 'loading' || !wishlist.data) {
    return (
      <ul
        className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
        aria-busy="true"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i}>
            <ProductCardSkeleton />
          </li>
        ))}
      </ul>
    );
  }

  const items = wishlist.data.items.filter((i) => savedIds.includes(i.product.id));
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Your wishlist is empty"
        description="Tap the heart on any product to save it here."
        action={
          <Button asChild>
            <Link href="/products">Explore products</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      {wishlist.data.unavailableCount > 0 ? (
        <Alert variant="info" className="mb-4">
          {wishlist.data.unavailableCount === 1
            ? '1 saved item is no longer on sale and is hidden.'
            : `${String(wishlist.data.unavailableCount)} saved items are no longer on sale and are hidden.`}
        </Alert>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <li key={item.product.id}>
            <ProductCard product={item.product} />
          </li>
        ))}
      </ul>
    </>
  );
}
