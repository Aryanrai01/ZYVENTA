'use client';

import {
  describeDiscount,
  INDIAN_STATES,
  type AddressView,
  type CheckoutQuote,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Lock, MapPin, Plus, Tag, TicketPercent, Truck } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ProductImage } from '@/components/catalog/product-image';
import { toast } from '@/components/feedback/toast';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressForm } from '@/features/account/components/address-form';
import { useAddressMutations, useAddresses } from '@/features/account/hooks/use-account';
import { useAuth } from '@/features/auth/use-auth';
import { cartKeys, errorMessage } from '@/features/cart/use-cart';
import { ApiClientError } from '@/lib/api-client';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { checkoutService } from '@/services/commerce.service';
import { newIdempotencyKey, payWithRazorpay } from './razorpay';

const stateName = (code: string) => INDIAN_STATES.find((s) => s.code === code)?.name ?? code;

export function CheckoutView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const addresses = useAddresses();
  const { create } = useAddressMutations();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'idle' | 'placing' | 'paying' | 'verifying'>('idle');
  const idempotencyKey = useRef<string>('');

  const selected =
    addressId ?? addresses.data?.find((a) => a.isDefault)?.id ?? addresses.data?.[0]?.id ?? null;

  const quote = useQuery({
    queryKey: ['checkout', 'quote', selected, coupon],
    queryFn: () =>
      checkoutService.quote({
        ...(selected ? { addressId: selected } : {}),
        ...(coupon ? { couponCode: coupon } : {}),
      }),
    enabled: addresses.isSuccess,
    staleTime: 0,
  });
  const coupons = useQuery({
    queryKey: ['coupons', 'public'],
    queryFn: checkoutService.coupons,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    idempotencyKey.current = newIdempotencyKey();
  }, []);

  const place = useMutation({
    mutationFn: async (q: CheckoutQuote) => {
      if (!selected) throw new Error('Choose a delivery address');
      setError('');
      setStage('placing');
      const init = await checkoutService.placeOrder(
        {
          addressId: selected,
          ...(coupon ? { couponCode: coupon } : {}),
          expectedTotal: q.pricing.total,
        },
        idempotencyKey.current,
      );
      setStage('paying');
      const outcome = await payWithRazorpay(init);
      if (outcome.kind !== 'paid') {
        // The order is kept for its payment window; it can be paid from the order page.
        return {
          orderId: init.orderId,
          paid: false,
          message: outcome.kind === 'failed' ? outcome.message : null,
        };
      }
      setStage('verifying');
      await checkoutService.verify(outcome.payload);
      return { orderId: init.orderId, paid: true, message: null };
    },
    onSuccess: ({ orderId, paid, message }) => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.all });
      if (message) toast.error(message);
      router.push(`/orders/${orderId}${paid ? '?placed=1' : ''}` as Route);
    },
    onError: (e) => {
      setStage('idle');
      idempotencyKey.current = newIdempotencyKey();
      setError(
        e instanceof ApiClientError || e instanceof Error ? e.message : 'Something went wrong',
      );
      void quote.refetch();
    },
  });

  if (!user) return null;
  const q = quote.data;
  const busy = stage !== 'idle';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div className="min-w-0 space-y-6">
        {!user.emailVerified ? (
          <Alert variant="warning" title="Verify your email to place orders">
            We sent a link to {user.email}.{' '}
            <Link href="/account" className="font-medium underline">
              Resend it from your account
            </Link>
            .
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="error" title="We couldn’t place your order">
            {error}
          </Alert>
        ) : null}

        <section
          aria-labelledby="address-heading"
          className="rounded-xl border bg-card p-5 shadow-card"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="address-heading" className="flex items-center gap-2 font-semibold">
              <MapPin className="size-4 text-primary" aria-hidden="true" /> Delivery address
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(true);
              }}
            >
              <Plus aria-hidden="true" /> Add new
            </Button>
          </div>
          {addresses.isPending ? (
            <Skeleton className="mt-4 h-20" />
          ) : (addresses.data ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Add an address to continue.</p>
          ) : (
            <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Choose an address</legend>
              {(addresses.data ?? []).map((a: AddressView) => (
                <label
                  key={a.id}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm',
                    selected === a.id
                      ? 'border-primary bg-primary-soft/40 ring-1 ring-primary'
                      : 'hover:border-foreground/30',
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    className="mt-1 accent-primary"
                    checked={selected === a.id}
                    onChange={() => {
                      setAddressId(a.id);
                    }}
                  />
                  <span>
                    <span className="font-medium">{a.fullName}</span>
                    {a.isDefault ? (
                      <Badge variant="primary" className="ml-2">
                        Default
                      </Badge>
                    ) : null}
                    <span className="mt-1 block text-muted-foreground">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {stateName(a.state)} {a.pincode}
                    </span>
                    <span className="block text-muted-foreground">Mobile {a.phone}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </section>

        <section
          aria-labelledby="items-heading"
          className="rounded-xl border bg-card p-5 shadow-card"
        >
          <h2 id="items-heading" className="flex items-center gap-2 font-semibold">
            <Truck className="size-4 text-primary" aria-hidden="true" /> Items and delivery
          </h2>
          {quote.isPending || !q ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : q.lines.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Your cart is empty.{' '}
              <Link href="/products" className="font-medium text-primary underline">
                Continue shopping
              </Link>
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {q.shipments.map((s) => (
                <div key={s.seller.id}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                    Shipment from {s.seller.storeName} ·{' '}
                    {s.shippingFee === 0
                      ? 'Free delivery'
                      : `Delivery ${formatPrice(s.shippingFee)}`}
                  </p>
                  <ul className="divide-y rounded-lg border">
                    {q.lines
                      .filter((l) => l.seller.id === s.seller.id)
                      .map((l) => (
                        <li key={l.variantId} className="flex gap-3 p-3">
                          <div className="w-14 shrink-0">
                            <ProductImage
                              image={l.image ? { url: l.image, alt: l.name } : null}
                              sizes="56px"
                              className="rounded-md border"
                            />
                          </div>
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="line-clamp-1 font-medium">{l.name}</p>
                            <p className="text-muted-foreground">
                              {Object.values(l.options).join(' · ')}
                              {Object.keys(l.options).length ? ' · ' : ''}Qty {l.quantity}
                            </p>
                            {l.offer ? (
                              <p className="text-xs text-discount">
                                {l.offer.title}: −{formatPrice(l.offer.discountPerUnit)} each
                              </p>
                            ) : null}
                          </div>
                          <p className="text-sm font-semibold tabular-nums">
                            {formatPrice(l.lineSubtotal)}
                          </p>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
              {q.lines.some((l) => l.status !== 'OK') ? (
                <Alert variant="warning" title="Some items need attention">
                  Stock or availability changed.{' '}
                  <Link href="/cart" className="font-medium underline">
                    Review your cart
                  </Link>
                  .
                </Alert>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <aside aria-labelledby="summary-heading" className="space-y-4 lg:sticky lg:top-32">
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-semibold">
            <TicketPercent className="size-4 text-primary" aria-hidden="true" /> Coupon
          </h2>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setCoupon(couponInput.trim().toUpperCase());
            }}
          >
            <label htmlFor="coupon" className="sr-only">
              Coupon code
            </label>
            <Input
              id="coupon"
              value={couponInput}
              maxLength={20}
              placeholder="Enter code"
              className="uppercase"
              onChange={(e) => {
                setCouponInput(e.target.value.replace(/[^a-z0-9]/gi, ''));
              }}
            />
            <Button type="submit" variant="outline" disabled={!couponInput.trim()}>
              Apply
            </Button>
          </form>
          {q?.coupon?.status === 'APPLIED' ? (
            <p className="mt-2 flex items-center justify-between gap-2 text-sm text-success">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-4" aria-hidden="true" /> {q.coupon.code} applied — you
                save {formatPrice(q.coupon.discount)}
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => {
                  setCoupon('');
                  setCouponInput('');
                }}
              >
                Remove
              </button>
            </p>
          ) : q?.coupon?.status === 'INVALID' ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {q.coupon.message}
            </p>
          ) : null}
          {(coupons.data ?? []).length > 0 ? (
            <ul className="mt-3 space-y-2">
              {(coupons.data ?? []).slice(0, 4).map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => {
                      setCouponInput(c.code);
                      setCoupon(c.code);
                    }}
                    className="flex w-full items-start gap-2 rounded-md border border-dashed p-2 text-left text-sm hover:border-primary"
                  >
                    <Tag className="mt-0.5 size-4 text-primary" aria-hidden="true" />
                    <span>
                      <span className="font-mono font-semibold">{c.code}</span> —{' '}
                      {describeDiscount(c.type, c.value, formatPrice, c.maxDiscount)}
                      {c.minOrderAmount > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          On orders above {formatPrice(c.minOrderAmount)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 id="summary-heading" className="font-semibold">
            Order summary
          </h2>
          {q ? (
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Items (MRP)" value={formatPrice(q.pricing.mrpTotal)} />
              {q.pricing.mrpTotal > q.pricing.subtotal ? (
                <Row
                  label="Discounts & offers"
                  value={`− ${formatPrice(q.pricing.mrpTotal - q.pricing.subtotal)}`}
                  tone="text-discount"
                />
              ) : null}
              {q.pricing.couponDiscount > 0 ? (
                <Row
                  label="Coupon"
                  value={`− ${formatPrice(q.pricing.couponDiscount)}`}
                  tone="text-discount"
                />
              ) : null}
              <Row
                label="Delivery"
                value={q.pricing.shippingFee === 0 ? 'Free' : formatPrice(q.pricing.shippingFee)}
              />
              <div className="flex justify-between border-t pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPrice(q.pricing.total)}</dd>
              </div>
              <p className="text-xs text-muted-foreground">
                Includes GST of {formatPrice(q.pricing.taxIncluded)}
              </p>
            </dl>
          ) : (
            <Skeleton className="mt-4 h-32" />
          )}
          <Button
            fullWidth
            size="lg"
            className="mt-5"
            loading={busy}
            disabled={!q?.canPlaceOrder || !user.emailVerified || busy}
            onClick={() => {
              if (q) place.mutate(q);
            }}
          >
            <Lock aria-hidden="true" />
            {stage === 'placing'
              ? 'Creating order…'
              : stage === 'paying'
                ? 'Waiting for payment…'
                : stage === 'verifying'
                  ? 'Confirming payment…'
                  : q
                    ? `Pay ${formatPrice(q.pricing.total)}`
                    : 'Pay'}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Payments are processed securely by Razorpay. We never see your card or UPI details.
          </p>
        </section>
      </aside>

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent side="right" title="Add a new address">
          <AddressForm
            submitting={create.isPending}
            onSubmit={async (input) => {
              const created = await create.mutateAsync(input);
              setAddressId(created.id);
              setAdding(false);
              toast.success('Address saved');
            }}
          />
        </SheetContent>
      </Sheet>
      {quote.error ? <p className="sr-only">{errorMessage(quote.error)}</p> : null}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', tone)}>{value}</dd>
    </div>
  );
}
