'use client';

import {
  REPORT_STATUSES,
  REVIEW_STATUSES,
  type AdminReviewRow,
  type ReportResolutionInput,
  type ReportStatus,
  type ReviewModerationInput,
  type ReviewStatus,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/data/confirm';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { StatusBadge, humanize } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/features/cart/use-cart';
import { adminService, type AdminReportRow } from '@/services/admin.service';

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

export function AdminReviews() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReviewStatus | ''>('FLAGGED');
  const [page, setPage] = useState(1);
  const [hiding, setHiding] = useState<{ row: AdminReviewRow; to: 'HIDDEN' | 'REMOVED' } | null>(
    null,
  );
  const query = useQuery({
    queryKey: ['admin', 'reviews', status, page],
    queryFn: () => adminService.reviews({ page, status: status || undefined }),
  });
  const moderate = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReviewModerationInput }) =>
      adminService.moderateReview(id, input),
    onSuccess: () => {
      toast.success('Review updated');
      setHiding(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns: Column<AdminReviewRow>[] = [
    {
      key: 'review',
      header: 'Review',
      cell: (r) => (
        <div className="max-w-md">
          <p className="flex items-center gap-1 font-medium">
            <Star className="size-3.5 fill-accent text-accent" aria-hidden="true" />
            {r.rating} · {r.title || 'Untitled'}
          </p>
          <p className="line-clamp-2 text-muted-foreground">{r.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.authorName} on{' '}
            <Link href={`/products/${r.product.slug}` as Route} className="underline">
              {r.product.name}
            </Link>
          </p>
        </div>
      ),
    },
    {
      key: 'reports',
      header: 'Reports',
      hideOnMobile: true,
      cell: (r) => r.reportCount,
    },
    {
      key: 'date',
      header: 'Posted',
      hideOnMobile: true,
      cell: (r) => dateFmt.format(new Date(r.createdAt)),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          {r.status !== 'PUBLISHED' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                moderate.mutate({ id: r.id, input: { status: 'PUBLISHED' } });
              }}
            >
              Publish
            </Button>
          ) : null}
          {r.status !== 'HIDDEN' && r.status !== 'REMOVED' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setHiding({ row: r, to: 'HIDDEN' });
              }}
            >
              Hide
            </Button>
          ) : null}
          {r.status !== 'REMOVED' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setHiding({ row: r, to: 'REMOVED' });
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Hidden and removed reviews no longer count towards product ratings."
      />
      <div className="mb-4">
        <FilterSelect
          label="Status"
          value={status}
          options={REVIEW_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Reviews"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="Nothing to moderate"
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
      <ConfirmDialog
        open={hiding !== null}
        onOpenChange={(o) => {
          if (!o) setHiding(null);
        }}
        title={hiding?.to === 'REMOVED' ? 'Remove this review?' : 'Hide this review?'}
        confirmLabel={hiding?.to === 'REMOVED' ? 'Remove' : 'Hide'}
        destructive
        reason="Reason (audit log)"
        pending={moderate.isPending}
        onConfirm={(reason) => {
          if (hiding)
            moderate.mutate({
              id: hiding.row.id,
              input: { status: hiding.to, ...(reason ? { reason } : {}) },
            });
        }}
      />
    </>
  );
}

const REPORT_ACTIONS = [
  'NONE',
  'CONTENT_REMOVED',
  'PRODUCT_BLOCKED',
  'SELLER_WARNED',
  'SELLER_SUSPENDED',
] as const;

export function AdminReports() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReportStatus | ''>('OPEN');
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<AdminReportRow | null>(null);
  const [outcome, setOutcome] = useState<'RESOLVED' | 'DISMISSED'>('RESOLVED');
  const [action, setAction] = useState<ReportResolutionInput['action']>('NONE');
  const query = useQuery({
    queryKey: ['admin', 'reports', status, page],
    queryFn: () => adminService.reports({ page, status: status || undefined }),
  });
  const resolve = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReportResolutionInput }) =>
      adminService.resolveReport(id, input),
    onSuccess: () => {
      toast.success('Report updated');
      setResolving(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns: Column<AdminReportRow>[] = [
    {
      key: 'target',
      header: 'Reported',
      cell: (r) => (
        <span>
          <span className="text-xs text-muted-foreground uppercase">{humanize(r.targetType)}</span>
          <span className="block font-medium">
            {r.target.link ? (
              <Link href={r.target.link as Route} className="hover:underline">
                {r.target.label}
              </Link>
            ) : (
              r.target.label
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (r) => (
        <span>
          {humanize(r.reason)}
          {r.details ? (
            <span className="line-clamp-2 block text-xs text-muted-foreground">{r.details}</span>
          ) : null}
        </span>
      ),
    },
    { key: 'by', header: 'Reporter', hideOnMobile: true, cell: (r) => r.reporter },
    {
      key: 'date',
      header: 'When',
      hideOnMobile: true,
      cell: (r) => dateFmt.format(new Date(r.createdAt)),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span>
          <StatusBadge status={r.status} />
          {r.resolution ? (
            <span className="block text-xs text-muted-foreground">
              {humanize(r.resolution.action)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) =>
        r.status === 'OPEN' || r.status === 'UNDER_REVIEW' ? (
          <div className="flex justify-end gap-2">
            {r.status === 'OPEN' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  resolve.mutate({
                    id: r.id,
                    input: { status: 'UNDER_REVIEW', action: 'NONE', note: '' },
                  });
                }}
              >
                Start review
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOutcome('RESOLVED');
                setAction('NONE');
                setResolving(r);
              }}
            >
              Resolve
            </Button>
          </div>
        ) : null,
    },
  ];
  return (
    <>
      <PageHeader
        title="Reports"
        description="Customer reports about products, reviews and sellers."
      />
      <div className="mb-4">
        <FilterSelect
          label="Status"
          value={status}
          options={REPORT_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Reports"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No reports"
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
      <ConfirmDialog
        open={resolving !== null}
        onOpenChange={(o) => {
          if (!o) setResolving(null);
        }}
        title="Close report"
        description="Blocking or suspending here applies immediately to the reported item or its seller."
        confirmLabel="Save"
        reason="Note (audit log)"
        pending={resolve.isPending}
        onConfirm={(note) => {
          if (resolving)
            resolve.mutate({
              id: resolving.id,
              input: { status: outcome, action: outcome === 'DISMISSED' ? 'NONE' : action, note },
            });
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Outcome</legend>
          <div className="flex gap-4 text-sm">
            {(['RESOLVED', 'DISMISSED'] as const).map((o) => (
              <label key={o} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="report-outcome"
                  checked={outcome === o}
                  onChange={() => {
                    setOutcome(o);
                  }}
                />
                {humanize(o)}
              </label>
            ))}
          </div>
        </fieldset>
        {outcome === 'RESOLVED' ? (
          <div className="space-y-2">
            <Label htmlFor="report-action">Action taken</Label>
            <select
              id="report-action"
              className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
              value={action}
              onChange={(e) => {
                setAction(e.target.value as ReportResolutionInput['action']);
              }}
            >
              {REPORT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
