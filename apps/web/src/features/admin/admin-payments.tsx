'use client';

import {
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  type PaymentStatus,
  type RefundStatus,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { StatusBadge, humanize } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/features/cart/use-cart';
import { formatPrice } from '@/lib/format';
import { adminService, type AdminPaymentRow, type AdminRefundRow } from '@/services/admin.service';

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const orderLink = (id: string, no: string) => (
  <Link href={`/admin/orders/${id}` as Route} className="font-medium text-primary hover:underline">
    {no}
  </Link>
);

export function AdminPayments() {
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['admin', 'payments', status, page],
    queryFn: () => adminService.payments({ page, status: status || undefined }),
  });
  const columns: Column<AdminPaymentRow>[] = [
    { key: 'order', header: 'Order', cell: (r) => orderLink(r.orderId, r.orderNumber) },
    {
      key: 'ids',
      header: 'Razorpay IDs',
      hideOnMobile: true,
      cell: (r) => (
        <span className="font-mono text-xs">
          {r.razorpayOrderId}
          <span className="block text-muted-foreground">{r.razorpayPaymentId ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      cell: (r) => (
        <span className="tabular-nums">
          {formatPrice(r.amount)}
          {r.amountRefunded > 0 ? (
            <span className="block text-xs text-muted-foreground">
              − {formatPrice(r.amountRefunded)} refunded
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Method · verified by',
      hideOnMobile: true,
      cell: (r) =>
        `${r.method ? humanize(r.method) : '—'} · ${r.verifiedVia ? humanize(r.verifiedVia) : '—'}`,
    },
    {
      key: 'date',
      header: 'Created',
      hideOnMobile: true,
      cell: (r) => dateFmt.format(new Date(r.createdAt)),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  ];
  return (
    <>
      <PageHeader
        title="Payments"
        description="Every Razorpay payment attempt. Status is set only by verified server-side checks and webhooks."
      />
      <div className="mb-4">
        <FilterSelect
          label="Status"
          value={status}
          options={PAYMENT_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Payments"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No payments"
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
    </>
  );
}

export function AdminRefunds() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RefundStatus | ''>('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['admin', 'refunds', status, page],
    queryFn: () => adminService.refunds({ page, status: status || undefined }),
  });
  const retry = useMutation({
    mutationFn: (id: string) => adminService.retryRefund(id),
    onSuccess: () => {
      toast.success('Refund resubmitted');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'refunds'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns: Column<AdminRefundRow>[] = [
    { key: 'order', header: 'Order', cell: (r) => orderLink(r.orderId, r.orderNumber) },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      cell: (r) => <span className="tabular-nums">{formatPrice(r.amount)}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      hideOnMobile: true,
      cell: (r) => (
        <span>
          {r.reason}
          {r.failureReason ? (
            <span className="block text-xs text-destructive">{r.failureReason}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Created',
      hideOnMobile: true,
      cell: (r) => dateFmt.format(new Date(r.createdAt)),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) =>
        r.status === 'FAILED' ? (
          <Button
            size="sm"
            variant="outline"
            loading={retry.isPending && retry.variables === r.id}
            onClick={() => {
              retry.mutate(r.id);
            }}
          >
            Retry
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <PageHeader
        title="Refunds"
        description="Refunds are idempotent: a retry reuses the original request key, so money is never sent twice."
      />
      <div className="mb-4">
        <FilterSelect
          label="Status"
          value={status}
          options={REFUND_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Refunds"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No refunds"
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
    </>
  );
}
