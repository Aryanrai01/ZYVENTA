'use client';

import type { CartLine, CartView as CartData } from '@zyventa/shared';
import { Heart, Lock, ShoppingBag, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { ProductImage } from '@/components/catalog/product-image';
import { QuantityStepper } from '@/components/catalog/quantity-stepper';
import { EmptyState } from '@/components/feedback/empty-state';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToggleWishlist, useWishlistIds } from '@/features/wishlist/use-wishlist';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { errorMessage, useCart, useCartActions } from '../use-cart';

const optionText = (line: CartLine) =>
  Object.entries(line.options)
    .map(([, value]) => value)
    .join(' · ');

export function CartView() {
  const { cart, isLoading, isFetching, error, refetch, mode } = useCart();

  if (error && !cart) {
    return (
      <Alert variant="error" title="We couldn’t load your cart">
        {errorMessage(error)}{' '}
        <button type="button" className="font-medium underline" onClick={() => void refetch()}>
          Try again
        </button>
      </Alert>
    );
  }
  if (isLoading || !cart) return <CartSkeleton />;

  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Browse today’s deals or pick up where you left off."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/products?sort=discount">Shop deals</Link>
            </Button>
            {mode === 'account' ? (
              <Button asChild variant="outline">
                <Link href="/wishlist">View wishlist</Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/login?next=%2Fcart">Sign in to see your cart</Link>
              </Button>
            )}
          </div>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <section
        aria-labelledby="cart-items"
        className={cn('min-w-0 transition-opacity', isFetching && 'opacity-80')}
      >
        <h2 id="cart-items" className="sr-only">
          Items
        </h2>
        {cart.hasIssues ? (
          <Alert variant="warning" title="Some items changed" className="mb-4">
            Prices or availability changed since you added them. Please review the highlighted
            items.
          </Alert>
        ) : null}
        <ul className="divide-y rounded-xl border bg-card">
          {cart.items.map((line) => (
            <CartLineRow key={line.variantId} line={line} signedIn={mode === 'account'} />
          ))}
        </ul>
      </section>

      <CartSummary cart={cart} signedIn={mode === 'account'} />
    </div>
  );
}

function CartLineRow({ line, signedIn }: { line: CartLine; signedIn: boolean }) {
  const { setQuantity, remove } = useCartActions();
  const savedIds = useWishlistIds();
  const { toggle } = useToggleWishlist();
  const busy =
    (setQuantity.isPending && setQuantity.variables.variantId === line.variantId) ||
    (remove.isPending && remove.variables === line.variantId);
  const available = line.status === 'OK' || line.status === 'QUANTITY_REDUCED';
  const href = line.slug ? (`/products/${line.slug}?variant=${line.variantId}` as Route) : null;

  return (
    <li className={cn('flex gap-3 p-4 sm:gap-4', busy && 'opacity-60')} aria-busy={busy}>
      <div className="w-20 shrink-0 sm:w-24">
        <ProductImage
          image={line.image}
          alt={line.name}
          sizes="96px"
          className="rounded-lg border"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
          <div className="min-w-0">
            {href ? (
              <Link href={href} className="line-clamp-2 font-medium hover:underline">
                {line.name}
              </Link>
            ) : (
              <p className="font-medium text-muted-foreground">{line.name}</p>
            )}
            {optionText(line) ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{optionText(line)}</p>
            ) : null}
            {line.seller.storeName ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sold by {line.seller.storeName}
              </p>
            ) : null}
          </div>
          {available ? (
            <div className="shrink-0 sm:text-right">
              <p className="font-semibold tabular-nums">{formatPrice(line.lineTotal)}</p>
              {line.unitMrp > line.unitPrice ? (
                <p className="text-xs text-price-strike tabular-nums line-through">
                  {formatPrice(line.unitMrp * Math.min(line.quantity, line.maxQuantity))}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <LineNotice line={line} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {available ? (
            <QuantityStepper
              size="sm"
              value={Math.min(line.quantity, line.maxQuantity)}
              max={line.maxQuantity}
              disabled={busy}
              label={`Quantity of ${line.name}`}
              onChange={(quantity) => {
                setQuantity.mutate({ variantId: line.variantId, quantity });
              }}
            />
          ) : null}
          {line.status === 'QUANTITY_REDUCED' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuantity.mutate({ variantId: line.variantId, quantity: line.maxQuantity });
              }}
            >
              Update to {line.maxQuantity}
            </Button>
          ) : null}
          {signedIn && line.productId && !savedIds.includes(line.productId) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                toggle(line.productId, false);
                remove.mutate(line.variantId);
              }}
            >
              <Heart aria-hidden="true" /> Save for later
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              remove.mutate(line.variantId);
            }}
            aria-label={`Remove ${line.name} from cart`}
          >
            <Trash2 aria-hidden="true" /> Remove
          </Button>
        </div>
      </div>
    </li>
  );
}

function LineNotice({ line }: { line: CartLine }) {
  const notices: { tone: 'warning' | 'destructive' | 'success'; text: string }[] = [];
  if (line.status === 'UNAVAILABLE') {
    notices.push({ tone: 'destructive', text: 'No longer available — remove it to continue' });
  } else if (line.status === 'OUT_OF_STOCK') {
    notices.push({ tone: 'destructive', text: 'Out of stock' });
  } else if (line.status === 'QUANTITY_REDUCED') {
    notices.push({
      tone: 'warning',
      text: `Only ${String(line.maxQuantity)} available — quantity adjusted`,
    });
  }
  if (line.previousUnitPrice !== null && line.status !== 'UNAVAILABLE') {
    const dropped = line.unitPrice < line.previousUnitPrice;
    notices.push({
      tone: dropped ? 'success' : 'warning',
      text: `Price ${dropped ? 'dropped' : 'increased'} from ${formatPrice(line.previousUnitPrice)} to ${formatPrice(line.unitPrice)}`,
    });
  }
  if (notices.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {notices.map((n) => (
        <Badge key={n.text} variant={n.tone} className="whitespace-normal">
          <TriangleAlert className="size-3" aria-hidden="true" />
          {n.text}
        </Badge>
      ))}
    </div>
  );
}

function CartSummary({ cart, signedIn }: { cart: CartData; signedIn: boolean }) {
  const { summary, shipments } = cart;
  const blocked = cart.items.some((i) => i.status !== 'OK');
  const nudges = shipments.filter((s) => s.shippingFee > 0 && s.amountToFreeShipping > 0);

  return (
    <aside
      aria-labelledby="order-summary"
      className="rounded-xl border bg-card p-5 shadow-card lg:sticky lg:top-32"
    >
      <h2 id="order-summary" className="text-lg font-semibold">
        Price details
      </h2>
      <dl className="mt-4 space-y-2.5 text-sm">
        <SummaryRow
          label={`Price (${String(summary.itemCount)} ${summary.itemCount === 1 ? 'item' : 'items'})`}
          value={formatPrice(summary.mrpTotal)}
        />
        {summary.savings > 0 ? (
          <SummaryRow
            label="Discount"
            value={`− ${formatPrice(summary.savings)}`}
            tone="text-discount"
          />
        ) : null}
        <SummaryRow
          label={
            shipments.length > 1 ? `Delivery (${String(shipments.length)} sellers)` : 'Delivery'
          }
          value={summary.shippingFee === 0 ? 'Free' : formatPrice(summary.shippingFee)}
          tone={summary.shippingFee === 0 ? 'text-discount' : undefined}
        />
        <div className="flex justify-between border-t pt-3 text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatPrice(summary.total)}</dd>
        </div>
      </dl>
      {summary.savings > 0 ? (
        <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success">
          You save {formatPrice(summary.savings)} on this order
        </p>
      ) : null}
      {nudges.map((s) => (
        <p key={s.seller.id} className="mt-2 text-xs text-muted-foreground">
          Add {formatPrice(s.amountToFreeShipping)} more from {s.seller.storeName} for free
          delivery.
        </p>
      ))}
      <p className="mt-3 text-xs text-muted-foreground">
        Prices include GST and any running offers. Apply coupons at checkout.
      </p>

      {signedIn ? (
        blocked ? (
          <Button fullWidth size="lg" className="mt-5" disabled>
            <Lock aria-hidden="true" /> Proceed to checkout
          </Button>
        ) : (
          <Button asChild fullWidth size="lg" className="mt-5">
            <Link href="/checkout">
              <Lock aria-hidden="true" /> Proceed to checkout
            </Link>
          </Button>
        )
      ) : (
        <Button asChild fullWidth size="lg" className="mt-5">
          <Link href="/login?next=%2Fcart">
            <Lock aria-hidden="true" /> Sign in to check out
          </Link>
        </Button>
      )}
      {blocked ? (
        <p className="mt-2 text-center text-xs text-destructive">
          Update or remove the highlighted items before checking out.
        </p>
      ) : null}
    </aside>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string | undefined;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', tone)}>{value}</dd>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]" aria-busy="true" aria-label="Loading cart">
      <div className="space-y-px rounded-xl border bg-card">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-4 p-4">
            <Skeleton className="size-24 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
