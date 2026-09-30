'use client';

import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  SELLER_ORDER_STATUS_LABELS,
  sellerOrderStateMachine,
  type OrderPaymentStatus,
  type OrderStatus,
  type SellerOrderStatus,
  type SellerOrderStatusUpdate,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/data/confirm';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { StatusBadge, humanize } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/cart/use-cart';
import { OrderTimeline } from '@/features/orders/order-timeline';
import { ShipmentActions } from '@/features/seller/shipment-actions';
import { formatPrice } from '@/lib/format';
import { adminService, type AdminOrderRow } from '@/services/admin.service';

export const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }));
const PAYMENT_OPTIONS = ORDER_PAYMENT_STATUSES.map((s) => ({ value: s, label: humanize(s) }));
/** Transitions that only the system performs (refund pipeline, return flow) are hidden. */
const ADMIN_MANUAL: readonly SellerOrderStatus[] = [
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export function AdminOrderList() {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [paymentStatus, setPaymentStatus] = useState<OrderPaymentStatus | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['admin', 'orders', status, paymentStatus, q, page],
    queryFn: () =>
      adminService.orders({
        page,
        status: status || undefined,
        paymentStatus: paymentStatus || undefined,
        q: q || undefined,
      }),
  });
  const columns: Column<AdminOrderRow>[] = [
    {
      key: 'no',
      header: 'Order',
      cell: (r) => (
        <Link
          href={`/admin/orders/${r.id}` as Route}
          className="font-medium text-primary hover:underline"
        >
          {r.orderNumber}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => (
        <span>
          {r.customer}
          <span className="block text-xs text-muted-foreground">{r.email}</span>
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Created',
      hideOnMobile: true,
      cell: (r) => dateTimeFmt.format(new Date(r.createdAt)),
    },
    { key: 'items', header: 'Items', hideOnMobile: true, cell: (r) => r.itemCount },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      cell: (r) => <span className="tabular-nums">{formatPrice(r.total)}</span>,
    },
    {
      key: 'payment',
      header: 'Payment',
      hideOnMobile: true,
      cell: (r) => <StatusBadge status={r.paymentStatus} />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge status={r.status} label={ORDER_STATUS_LABELS[r.status]} />,
    },
  ];
  return (
    <>
      <PageHeader title="Orders" description="Every order across the marketplace." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Payment"
          value={paymentStatus}
          options={PAYMENT_OPTIONS}
          onChange={(v) => {
            setPaymentStatus(v);
            setPage(1);
          }}
        />
        <label className="sr-only" htmlFor="admin-order-search">
          Search orders
        </label>
        <Input
          id="admin-order-search"
          placeholder="Order number or email"
          className="h-9 max-w-64"
          value={q}
          onChange={(e) => {
            setQ(e.target.value.trim());
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Orders"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No orders match"
        onRowClick={(r) => {
          router.push(`/admin/orders/${r.id}` as Route);
        }}
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
    </>
  );
}

export function AdminOrderDetailView({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const key = ['admin', 'order', id];
  const [cancelling, setCancelling] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [amount, setAmount] = useState('');
  const order = useQuery({ queryKey: key, queryFn: () => adminService.order(id) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
  };
  const cancel = useMutation({
    mutationFn: (reason: string) => adminService.cancelOrder(id, reason),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setCancelling(false);
      refresh();
      toast.success('Order cancelled; any payment will be refunded');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const refund = useMutation({
    mutationFn: ({ paise, note }: { paise: number; note: string }) =>
      adminService.refundOrder(id, paise, note),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setRefunding(false);
      setAmount('');
      refresh();
      toast.success('Refund initiated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const shipment = useMutation({
    mutationFn: ({ sid, input }: { sid: string; input: SellerOrderStatusUpdate }) =>
      adminService.updateShipment(sid, input),
    onSuccess: () => {
      refresh();
      toast.success('Shipment updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (order.error) return <Alert variant="error">Order not found.</Alert>;
  const o = order.data;
  if (!o) return <Skeleton className="h-96 rounded-xl" />;
  const refundable = o.payment?.capturedAt ? o.pricing.total - o.refundedAmount : 0;
  const paise = Math.round(Number(amount) * 100);
  const amountValid = Number.isFinite(paise) && paise >= 100 && paise <= refundable;
  const a = o.shippingAddress;

  return (
    <>
      <PageHeader
        title={`Order ${o.orderNumber}`}
        description={`Created ${dateTimeFmt.format(new Date(o.createdAt))}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} label={ORDER_STATUS_LABELS[o.status]} />
            {o.status === 'CONFIRMED' || o.status === 'PENDING_PAYMENT' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCancelling(true);
                }}
              >
                Cancel order
              </Button>
            ) : null}
            {refundable >= 100 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRefunding(true);
                }}
              >
                Refund
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {o.shipments.map((s) => {
            const next = sellerOrderStateMachine
              .nextStatuses(s.status, 'ADMIN')
              .filter((st) => ADMIN_MANUAL.includes(st) || st === 'CANCELLED');
            return (
              <section key={s.id} className="rounded-xl border bg-card p-5 shadow-card">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    {s.subOrderNumber} · {s.seller.storeName}
                  </h2>
                  <StatusBadge status={s.status} label={SELLER_ORDER_STATUS_LABELS[s.status]} />
                </div>
                <OrderTimeline status={s.status} history={s.history} />
                <ul className="mt-4 divide-y text-sm">
                  {s.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 py-2">
                      <span>
                        <span className="font-medium">{i.name}</span>
                        <span className="block text-muted-foreground">
                          SKU {i.sku} · Qty {i.quantity}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatPrice(i.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
                {s.tracking.trackingNumber ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {s.tracking.carrier} · {s.tracking.trackingNumber}
                  </p>
                ) : null}
                <div className="mt-4 border-t pt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                    Admin override
                  </p>
                  <ShipmentActions
                    next={next}
                    pending={shipment.isPending}
                    onUpdate={(input) => {
                      shipment.mutate({ sid: s.id, input });
                    }}
                  />
                </div>
              </section>
            );
          })}
          {o.returns.length > 0 ? (
            <section className="rounded-xl border bg-card p-5 shadow-card">
              <h2 className="font-semibold">Returns</h2>
              <ul className="mt-3 divide-y text-sm">
                {o.returns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {r.itemName} × {r.quantity}
                    </span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-5 text-sm shadow-card">
            <h2 className="font-semibold">Customer</h2>
            <p className="mt-2">
              {o.customer?.name ?? a.fullName}
              <span className="block text-muted-foreground">{o.contact.email}</span>
              <span className="block text-muted-foreground">{o.contact.phone}</span>
            </p>
            <address className="mt-3 text-muted-foreground not-italic">
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ''}
              <br />
              {a.city}, {a.state} {a.pincode}
            </address>
          </section>
          <section className="rounded-xl border bg-card p-5 text-sm shadow-card">
            <h2 className="font-semibold">Payment</h2>
            <dl className="mt-2 space-y-1">
              <Row label="Subtotal" value={formatPrice(o.pricing.subtotal)} />
              {o.pricing.couponDiscount > 0 ? (
                <Row
                  label={`Coupon ${o.coupon?.code ?? ''}`}
                  value={`− ${formatPrice(o.pricing.couponDiscount)}`}
                />
              ) : null}
              <Row label="Shipping" value={formatPrice(o.pricing.shippingFee)} />
              <Row label="Total" value={formatPrice(o.pricing.total)} strong />
              <Row label="Refunded" value={formatPrice(o.refundedAmount)} />
            </dl>
            <p className="mt-3 flex items-center gap-2">
              <StatusBadge status={o.paymentStatus} />
              {o.payment?.display ? (
                <span className="text-muted-foreground">{o.payment.display}</span>
              ) : null}
            </p>
            {o.refunds.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t pt-3">
                {o.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="tabular-nums">{formatPrice(r.amount)}</span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </aside>
      </div>
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this order?"
        description="Stock is released and any captured payment is refunded in full to the customer."
        confirmLabel="Cancel order"
        destructive
        reason="Reason (shared with the customer)"
        reasonRequired
        pending={cancel.isPending}
        onConfirm={(reason) => {
          cancel.mutate(reason);
        }}
      />
      <ConfirmDialog
        open={refunding}
        onOpenChange={setRefunding}
        title="Issue a refund"
        description={`Up to ${formatPrice(refundable)} can be refunded to the original payment method.`}
        confirmLabel="Refund"
        reason="Internal note"
        reasonRequired
        pending={refund.isPending}
        onConfirm={(note) => {
          if (!amountValid) {
            toast.error('Enter an amount between ₹1 and the refundable balance');
            return;
          }
          refund.mutate({ paise, note });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="refund-amount">Amount (₹)</Label>
          <Input
            id="refund-amount"
            inputMode="decimal"
            value={amount}
            aria-invalid={amount !== '' && !amountValid}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.]/g, ''));
            }}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'border-t pt-1 font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
