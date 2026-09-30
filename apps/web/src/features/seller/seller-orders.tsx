'use client';

import {
  SELLER_ORDER_STATUSES,
  SELLER_ORDER_STATUS_LABELS,
  type SellerOrderRow,
  type SellerOrderStatus,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/cart/use-cart';
import { OrderTimeline } from '@/features/orders/order-timeline';
import { formatPrice } from '@/lib/format';
import { sellerService } from '@/services/seller.service';
import { ShipmentActions } from './shipment-actions';

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const STATUS_OPTIONS = SELLER_ORDER_STATUSES.map((s) => ({
  value: s,
  label: SELLER_ORDER_STATUS_LABELS[s],
}));

export function SellerOrderList() {
  const router = useRouter();
  const initial = (useSearchParams().get('status') ?? '') as SellerOrderStatus | '';
  const [status, setStatus] = useState<SellerOrderStatus | ''>(initial);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['seller', 'orders', status, q, page],
    queryFn: () =>
      sellerService.orders({ page, ...(status ? { status } : {}), ...(q ? { q } : {}) }),
  });
  const columns: Column<SellerOrderRow>[] = [
    {
      key: 'no',
      header: 'Order',
      cell: (r) => (
        <Link
          href={`/seller/orders/${r.id}` as Route}
          className="font-medium text-primary hover:underline"
        >
          {r.subOrderNumber}
        </Link>
      ),
    },
    {
      key: 'item',
      header: 'Items',
      cell: (r) => (
        <span className="line-clamp-1">
          {r.previewName}
          {r.itemCount > 1 ? ` +${String(r.itemCount - 1)}` : ''}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      hideOnMobile: true,
      cell: (r) => `${r.customerName}, ${r.city}`,
    },
    {
      key: 'date',
      header: 'Placed',
      hideOnMobile: true,
      cell: (r) => dateFmt.format(new Date(r.createdAt)),
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      cell: (r) => <span className="tabular-nums">{formatPrice(r.total)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge status={r.status} label={SELLER_ORDER_STATUS_LABELS[r.status]} />,
    },
  ];
  return (
    <>
      <PageHeader title="Orders" description="Only paid orders appear here." />
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
        <label className="sr-only" htmlFor="order-search">
          Search by order number
        </label>
        <Input
          id="order-search"
          placeholder="Search order number"
          className="h-9 max-w-56"
          value={q}
          onChange={(e) => {
            setQ(e.target.value.trim());
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Seller orders"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No orders yet"
        onRowClick={(r) => {
          router.push(`/seller/orders/${r.id}` as Route);
        }}
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
    </>
  );
}

export function SellerOrderDetailView({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ['seller', 'order', id],
    queryFn: () => sellerService.order(id),
  });
  const update = useMutation({
    mutationFn: (input: Parameters<typeof sellerService.updateOrderStatus>[1]) =>
      sellerService.updateOrderStatus(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(['seller', 'order', id], data);
      void queryClient.invalidateQueries({ queryKey: ['seller', 'orders'] });
      toast.success('Order updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (order.error) return <Alert variant="error">Order not found.</Alert>;
  const o = order.data;
  if (!o) return <Skeleton className="h-96 rounded-xl" />;
  const a = o.shippingAddress;
  return (
    <>
      <PageHeader
        title={`Order ${o.subOrderNumber}`}
        description={`Placed ${dateFmt.format(new Date(o.createdAt))}`}
        actions={<StatusBadge status={o.status} label={SELLER_ORDER_STATUS_LABELS[o.status]} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-card">
            <OrderTimeline status={o.status} history={o.history} />
            <div className="mt-5">
              <ShipmentActions
                next={o.nextStatuses}
                pending={update.isPending}
                onUpdate={(input) => {
                  update.mutate(input);
                }}
              />
            </div>
            {o.tracking.trackingNumber ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {o.tracking.carrier} · {o.tracking.trackingNumber}
              </p>
            ) : null}
          </section>
          <section className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="font-semibold">Items to pack</h2>
            <ul className="mt-3 divide-y text-sm">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{i.name}</span>
                    <span className="block text-muted-foreground">
                      SKU {i.sku} · {Object.values(i.options).join(' · ')} · Qty {i.quantity}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatPrice(i.lineSubtotal)}</span>
                </li>
              ))}
            </ul>
          </section>
          {o.returns.length > 0 ? (
            <section className="rounded-xl border bg-card p-5 shadow-card">
              <h2 className="font-semibold">Returns</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage these from{' '}
                <Link className="underline" href="/seller/returns">
                  Returns
                </Link>
                .
              </p>
            </section>
          ) : null}
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-5 text-sm shadow-card">
            <h2 className="font-semibold">Ship to</h2>
            <address className="mt-2 text-muted-foreground not-italic">
              <span className="font-medium text-foreground">{a.fullName}</span>
              <br />
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ''}
              <br />
              {a.landmark ? (
                <>
                  {a.landmark}
                  <br />
                </>
              ) : null}
              {a.city}, {a.state} {a.pincode}
              <br />
              Mobile {a.phone}
            </address>
          </section>
          <section className="rounded-xl border bg-card p-5 text-sm shadow-card">
            <h2 className="font-semibold">Earnings</h2>
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Items</dt>
                <dd className="tabular-nums">{formatPrice(o.pricing.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping collected</dt>
                <dd className="tabular-nums">{formatPrice(o.pricing.shippingFee)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Commission</dt>
                <dd className="tabular-nums">− {formatPrice(o.commissionAmount)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Your payout</dt>
                <dd className="tabular-nums">{formatPrice(o.payout)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Payable after the return window closes.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
