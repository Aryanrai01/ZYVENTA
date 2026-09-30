'use client';

import {
  RETURN_REASON_LABELS,
  RETURN_STATUSES,
  RETURN_STATUS_LABELS,
  type ReturnDecisionInput,
  type ReturnStatus,
  type SellerReturnRow,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/data/confirm';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/features/cart/use-cart';
import type { ApiResult } from '@/lib/api-client';

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const ACTION_LABELS: Partial<Record<ReturnStatus, string>> = {
  APPROVED: 'Approve',
  REJECTED: 'Reject',
  PICKED_UP: 'Picked up',
  RECEIVED: 'Received — refund',
};

/** Shared by Seller Center and Admin: return queue with state-machine driven actions. */
export function ReturnsTable({
  queryKey,
  load,
  decide,
}: {
  queryKey: string;
  load: (q: { status?: string; page: number }) => Promise<ApiResult<SellerReturnRow[]>>;
  decide: (id: string, input: ReturnDecisionInput) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReturnStatus | ''>('REQUESTED');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<SellerReturnRow | null>(null);
  const query = useQuery({
    queryKey: [queryKey, status, page],
    queryFn: () => load({ page, ...(status ? { status } : {}) }),
  });
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReturnDecisionInput }) => decide(id, input),
    onSuccess: () => {
      toast.success('Return updated');
      setRejecting(null);
      void queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns: Column<SellerReturnRow>[] = [
    {
      key: 'order',
      header: 'Order',
      cell: (r) => <span className="font-medium">{r.subOrderNumber}</span>,
    },
    {
      key: 'item',
      header: 'Item',
      cell: (r) => (
        <span className="line-clamp-2">
          {r.itemName} × {r.quantity}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      hideOnMobile: true,
      cell: (r) => (
        <span>
          {RETURN_REASON_LABELS[r.reason]}
          {r.comment ? (
            <span className="block text-xs text-muted-foreground">“{r.comment}”</span>
          ) : null}
        </span>
      ),
    },
    { key: 'customer', header: 'Customer', hideOnMobile: true, cell: (r) => r.customerName },
    {
      key: 'date',
      header: 'Requested',
      hideOnMobile: true,
      cell: (r) => dateFmt.format(new Date(r.createdAt)),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge status={r.status} label={RETURN_STATUS_LABELS[r.status]} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.nextStatuses.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === 'REJECTED' ? 'ghost' : 'outline'}
              loading={mutation.isPending && mutation.variables.id === r.id}
              onClick={() => {
                if (s === 'REJECTED') setRejecting(r);
                else
                  mutation.mutate({
                    id: r.id,
                    input: { status: s as ReturnDecisionInput['status'] },
                  });
              }}
            >
              {ACTION_LABELS[s] ?? s}
            </Button>
          ))}
        </div>
      ),
    },
  ];
  return (
    <>
      <div className="mb-4">
        <FilterSelect
          label="Status"
          value={status}
          options={RETURN_STATUSES.map((s) => ({ value: s, label: RETURN_STATUS_LABELS[s] }))}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Returns"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No returns here"
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(o) => {
          if (!o) setRejecting(null);
        }}
        title="Reject this return?"
        confirmLabel="Reject"
        destructive
        reason="Reason (shared with the customer)"
        reasonRequired
        pending={mutation.isPending}
        onConfirm={(note) => {
          if (rejecting) mutation.mutate({ id: rejecting.id, input: { status: 'REJECTED', note } });
        }}
      />
    </>
  );
}
