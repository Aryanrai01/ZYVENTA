'use client';

import {
  INDIAN_STATES,
  ORDER_STATUS_LABELS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  type OrderDetail,
  type OrderItemView,
  type ReturnReason,
  type ShipmentView,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, CreditCard, ExternalLink, PartyPopper, Truck } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ProductImage } from '@/components/catalog/product-image';
import { ConfirmDialog } from '@/components/data/confirm';
import { StatusBadge, humanize } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/cart/use-cart';
import { payWithRazorpay } from '@/features/checkout/razorpay';
import { formatPrice } from '@/lib/format';
import { checkoutService, engagementService, orderService } from '@/services/commerce.service';
import { ReturnDialog, ReviewDialog } from './order-dialogs';
import { OrderTimeline } from './order-timeline';

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const stateName = (code: string) => INDIAN_STATES.find((s) => s.code === code)?.name ?? code;

export function OrderDetailView({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const placed = useSearchParams().get('placed') === '1';
  const key = ['order', orderId];
  const order = useQuery({ queryKey: key, queryFn: () => orderService.detail(orderId) });
  const setOrder = (data: OrderDetail) => {
    queryClient.setQueryData(key, data);
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  const [cancelTarget, setCancelTarget] = useState<'order' | ShipmentView | null>(null);
  const [returnItem, setReturnItem] = useState<OrderItemView | null>(null);
  const [reviewItem, setReviewItem] = useState<OrderItemView | null>(null);

  const cancel = useMutation({
    mutationFn: (reason: string) =>
      cancelTarget === 'order' || cancelTarget === null
        ? orderService.cancel(orderId, { reason })
        : orderService.cancelShipment(orderId, cancelTarget.id, { reason }),
    onSuccess: (data) => {
      setOrder(data);
      setCancelTarget(null);
      toast.success('Cancellation processed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pay = useMutation({
    mutationFn: async () => {
      const init = await orderService.pay(orderId);
      const outcome = await payWithRazorpay(init);
      if (outcome.kind === 'paid') await checkoutService.verify(outcome.payload);
      else if (outcome.kind === 'failed') throw new Error(outcome.message);
      return outcome.kind;
    },
    onSuccess: (kind) => {
      if (kind === 'paid') toast.success('Payment received — thank you!');
      void order.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : errorMessage(e)),
  });

  const requestReturn = useMutation({
    mutationFn: (input: { quantity: number; reason: ReturnReason; comment: string }) =>
      orderService.requestReturn(orderId, { orderItemId: returnItem?.id ?? '', ...input }),
    onSuccess: (data) => {
      setOrder(data);
      setReturnItem(null);
      toast.success('Return requested');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const review = useMutation({
    mutationFn: (input: { rating: number; title: string; body: string }) =>
      engagementService.createReview({ orderItemId: reviewItem?.id ?? '', ...input }),
    onSuccess: () => {
      setReviewItem(null);
      toast.success('Thanks for your review!');
      void order.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const cancelReturn = useMutation({
    mutationFn: (returnId: string) => orderService.cancelReturn(orderId, returnId),
    onSuccess: setOrder,
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (order.error) return <Alert variant="error">We couldn’t find this order.</Alert>;
  if (!order.data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  const o = order.data;
  const a = o.shippingAddress;

  return (
    <div className="space-y-6">
      {placed && o.status === 'CONFIRMED' ? (
        <Alert variant="success" title="Order placed!">
          <span className="inline-flex items-center gap-1">
            <PartyPopper className="size-4" aria-hidden="true" /> We’ve emailed your confirmation to{' '}
            {o.contact.email}.
          </span>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order {o.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed {dateFmt.format(new Date(o.createdAt))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} label={ORDER_STATUS_LABELS[o.status]} />
          <StatusBadge status={o.paymentStatus} />
        </div>
      </div>

      {o.status === 'PENDING_PAYMENT' ? (
        <Alert variant="warning" title="Payment pending">
          <span className="inline-flex flex-wrap items-center gap-2">
            <Clock className="size-4" aria-hidden="true" />
            {o.canPay && o.expiresAt
              ? `Complete payment before ${new Date(o.expiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} or the order is released.`
              : 'The payment window has closed.'}
          </span>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {o.canPay ? (
          <Button
            loading={pay.isPending}
            onClick={() => {
              pay.mutate();
            }}
          >
            <CreditCard aria-hidden="true" /> Pay {formatPrice(o.pricing.total)}
          </Button>
        ) : null}
        {o.canCancel ? (
          <Button
            variant="outline"
            onClick={() => {
              setCancelTarget('order');
            }}
          >
            Cancel order
          </Button>
        ) : null}
      </div>

      {o.shipments.map((s) => (
        <section
          key={s.id}
          aria-label={`Shipment ${s.subOrderNumber}`}
          className="rounded-xl border bg-card p-4 shadow-card sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Shipment {s.subOrderNumber}</p>
              <p className="text-xs text-muted-foreground">Sold by {s.seller.storeName}</p>
            </div>
            <StatusBadge status={s.status} />
          </div>
          {o.status !== 'PENDING_PAYMENT' && o.status !== 'EXPIRED' ? (
            <div className="mt-4">
              <OrderTimeline status={s.status} history={s.history} />
            </div>
          ) : null}
          {s.tracking.trackingNumber ? (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Truck className="size-4 text-primary" aria-hidden="true" />
              {s.tracking.carrier} · <span className="font-mono">{s.tracking.trackingNumber}</span>
              {s.tracking.trackingUrl ? (
                <a
                  href={s.tracking.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  Track <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
            </p>
          ) : null}
          <ul className="mt-4 divide-y">
            {s.items.map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                <div className="w-16 shrink-0">
                  <ProductImage
                    image={item.image ? { url: item.image, alt: item.name } : null}
                    sizes="64px"
                    className="rounded-md border"
                  />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <Link
                    href={`/products/${item.slug}` as Route}
                    className="line-clamp-2 font-medium hover:underline"
                  >
                    {item.name}
                  </Link>
                  <p className="text-muted-foreground">
                    {Object.values(item.options).join(' · ')}
                    {Object.keys(item.options).length ? ' · ' : ''}Qty {item.quantity}
                  </p>
                  {item.status !== 'ACTIVE' ? (
                    <p className="mt-1">
                      <StatusBadge status={item.status} />
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.canReturn ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReturnItem(item);
                        }}
                      >
                        Return
                      </Button>
                    ) : null}
                    {item.canReview ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReviewItem(item);
                        }}
                      >
                        Write a review
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm font-semibold tabular-nums">{formatPrice(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
          {s.canCancel && o.shipments.length > 1 ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                setCancelTarget(s);
              }}
            >
              Cancel this shipment
            </Button>
          ) : null}
        </section>
      ))}

      {o.returns.length > 0 ? (
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold">Returns</h2>
          <ul className="mt-3 divide-y text-sm">
            {o.returns.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {r.itemName} × {r.quantity} — {RETURN_REASON_LABELS[r.reason]}
                  {r.resolutionNote ? (
                    <span className="block text-xs text-muted-foreground">{r.resolutionNote}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={r.status} label={RETURN_STATUS_LABELS[r.status]} />
                  {r.status === 'REQUESTED' || r.status === 'APPROVED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={cancelReturn.isPending}
                      onClick={() => {
                        cancelReturn.mutate(r.id);
                      }}
                    >
                      Withdraw
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold">Delivery address</h2>
          <address className="mt-2 text-sm text-muted-foreground not-italic">
            <span className="font-medium text-foreground">{a.fullName}</span>
            <br />
            {a.line1}
            {a.line2 ? `, ${a.line2}` : ''}
            <br />
            {a.city}, {stateName(a.state)} {a.pincode}
            <br />
            Mobile {a.phone}
          </address>
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold">Payment summary</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <Row label="Items" value={formatPrice(o.pricing.subtotal)} />
            {o.pricing.couponDiscount > 0 ? (
              <Row
                label={`Coupon ${o.coupon?.code ?? ''}`}
                value={`− ${formatPrice(o.pricing.couponDiscount)}`}
              />
            ) : null}
            <Row
              label="Delivery"
              value={o.pricing.shippingFee === 0 ? 'Free' : formatPrice(o.pricing.shippingFee)}
            />
            <div className="flex justify-between border-t pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPrice(o.pricing.total)}</dd>
            </div>
            {o.payment?.display ? (
              <p className="text-xs text-muted-foreground">Paid with {o.payment.display}</p>
            ) : o.payment?.method ? (
              <p className="text-xs text-muted-foreground">
                Paid via {o.payment.method.toUpperCase()}
              </p>
            ) : null}
            {o.refunds.map((r) => (
              <Row
                key={r.id}
                label={`Refund (${humanize(r.status)})`}
                value={`− ${formatPrice(r.amount)}`}
              />
            ))}
          </dl>
        </section>
      </div>

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title={cancelTarget === 'order' ? 'Cancel this order?' : 'Cancel this shipment?'}
        description={
          o.paymentStatus === 'PAID'
            ? 'Your refund starts immediately and reaches your account in 5–7 working days.'
            : undefined
        }
        confirmLabel="Cancel"
        destructive
        reason="Reason for cancelling"
        reasonRequired
        pending={cancel.isPending}
        onConfirm={(reason) => {
          cancel.mutate(reason);
        }}
      />
      <ReturnDialog
        item={returnItem}
        onClose={() => {
          setReturnItem(null);
        }}
        pending={requestReturn.isPending}
        onSubmit={(input) => {
          requestReturn.mutate(input);
        }}
      />
      <ReviewDialog
        item={reviewItem}
        onClose={() => {
          setReviewItem(null);
        }}
        pending={review.isPending}
        onSubmit={(input) => {
          review.mutate(input);
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
