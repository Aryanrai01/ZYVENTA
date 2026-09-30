'use client';

import {
  ROLES,
  SELLER_APPLICATION_STATUSES,
  SELLER_STATUSES,
  type AdminSellerRow,
  type AdminUserRow,
  type Role,
  type SellerApplicationStatus,
  type SellerApplicationView,
  type SellerStatus,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/data/confirm';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { StatusBadge, humanize } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/features/cart/use-cart';
import { adminService } from '@/services/admin.service';

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const opts = <V extends string>(values: readonly V[]) =>
  values.map((value) => ({ value, label: humanize(value) }));

function SearchBox({ id, onChange }: { id: string; onChange: (q: string) => void }) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        Search
      </label>
      <Input
        id={id}
        placeholder="Search"
        className="h-9 max-w-64"
        onChange={(e) => {
          onChange(e.target.value.trim());
        }}
      />
    </>
  );
}

function useAdminMutation<I>(fn: (input: I) => Promise<unknown>, invalidate: string, ok: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(ok);
      void queryClient.invalidateQueries({ queryKey: ['admin', invalidate] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ── Users ────────────────────────────────────────────────────────────────────

export function AdminUsers() {
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED' | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'users', role, status, q, page],
    queryFn: () =>
      adminService.users({
        page,
        role: role || undefined,
        status: status || undefined,
        q: q || undefined,
      }),
  });
  const update = useAdminMutation(
    ({ id, suspend, reason }: { id: string; suspend: boolean; reason: string }) =>
      adminService.setUserStatus(
        id,
        suspend ? { status: 'SUSPENDED', reason } : { status: 'ACTIVE' },
      ),
    'users',
    'User updated',
  );
  const columns: Column<AdminUserRow>[] = [
    {
      key: 'name',
      header: 'User',
      cell: (r) => (
        <span>
          <span className="font-medium">{r.name}</span>
          <span className="block text-xs text-muted-foreground">
            {r.email}
            {r.emailVerified ? '' : ' · unverified'}
          </span>
        </span>
      ),
    },
    { key: 'roles', header: 'Roles', cell: (r) => r.roles.map(humanize).join(', ') },
    { key: 'orders', header: 'Orders', hideOnMobile: true, cell: (r) => r.orderCount },
    {
      key: 'joined',
      header: 'Joined',
      hideOnMobile: true,
      cell: (r) => dateFmt.format(new Date(r.createdAt)),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) =>
        r.roles.includes('ADMIN') ? null : r.status === 'SUSPENDED' ? (
          <Button
            size="sm"
            variant="outline"
            loading={update.isPending && update.variables.id === r.id}
            onClick={() => {
              update.mutate({ id: r.id, suspend: false, reason: '' });
            }}
          >
            Reactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTarget(r);
            }}
          >
            Suspend
          </Button>
        ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Users"
        description="Suspending a user signs them out everywhere and blocks sign-in."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Role"
          value={role}
          options={opts(ROLES)}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Status"
          value={status}
          options={opts(['ACTIVE', 'SUSPENDED'] as const)}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <SearchBox
          id="user-search"
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Users"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        title={`Suspend ${target?.name ?? 'user'}?`}
        confirmLabel="Suspend"
        destructive
        reason="Reason (recorded in the audit log)"
        reasonRequired
        pending={update.isPending}
        onConfirm={(reason) => {
          if (target) update.mutate({ id: target.id, suspend: true, reason });
          setTarget(null);
        }}
      />
    </>
  );
}

// ── Seller applications ─────────────────────────────────────────────────────

export function AdminApplications() {
  const [status, setStatus] = useState<SellerApplicationStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<SellerApplicationView | null>(null);
  const [approving, setApproving] = useState<SellerApplicationView | null>(null);
  const [commission, setCommission] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'applications', status, page],
    queryFn: () => adminService.applications({ page, status: status || undefined }),
  });
  const decide = useAdminMutation(
    (v: { id: string; approve: boolean; reason: string; commissionBps?: number }) =>
      adminService.decideApplication(
        v.id,
        v.approve
          ? {
              decision: 'APPROVE',
              ...(v.commissionBps !== undefined ? { commissionBps: v.commissionBps } : {}),
            }
          : { decision: 'REJECT', reason: v.reason },
      ),
    'applications',
    'Decision recorded',
  );
  const columns: Column<SellerApplicationView>[] = [
    {
      key: 'store',
      header: 'Store',
      cell: (r) => (
        <span>
          <span className="font-medium">{r.storeName}</span>
          <span className="block text-xs text-muted-foreground">
            {r.legalName} · {humanize(r.businessType)}
          </span>
        </span>
      ),
    },
    {
      key: 'applicant',
      header: 'Applicant',
      hideOnMobile: true,
      cell: (r) =>
        r.applicant ? (
          <span>
            {r.applicant.name}
            <span className="block text-xs text-muted-foreground">{r.applicant.email}</span>
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'gst',
      header: 'GSTIN · pickup',
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-xs">
          {r.gstin ?? 'No GSTIN'}
          <span className="block text-muted-foreground">
            {r.pickupAddress.city}, {r.pickupAddress.state} {r.pickupAddress.pincode}
          </span>
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Applied',
      hideOnMobile: true,
      cell: (r) => dateFmt.format(new Date(r.createdAt)),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span>
          <StatusBadge status={r.status} />
          {r.rejectionReason ? (
            <span className="block text-xs text-muted-foreground">{r.rejectionReason}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) =>
        r.status === 'PENDING' ? (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={() => {
                setApproving(r);
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRejecting(r);
              }}
            >
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];
  const bps = commission === '' ? undefined : Math.round(Number(commission) * 100);
  const bpsValid = bps === undefined || (Number.isFinite(bps) && bps >= 0 && bps <= 5000);
  return (
    <>
      <PageHeader
        title="Seller applications"
        description="Approving creates the seller store and grants the SELLER role."
      />
      <div className="mb-4">
        <FilterSelect
          label="Status"
          value={status}
          options={opts(SELLER_APPLICATION_STATUSES)}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Seller applications"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No applications"
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(o) => {
          if (!o) {
            setApproving(null);
            setCommission('');
          }
        }}
        title={`Approve ${approving?.storeName ?? ''}?`}
        description="Leave commission empty to use the platform default."
        confirmLabel="Approve"
        pending={decide.isPending}
        onConfirm={() => {
          if (!approving || !bpsValid) return;
          decide.mutate({
            id: approving.id,
            approve: true,
            reason: '',
            ...(bps !== undefined ? { commissionBps: bps } : {}),
          });
          setApproving(null);
          setCommission('');
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="approve-commission">Commission (%)</Label>
          <Input
            id="approve-commission"
            inputMode="decimal"
            placeholder="Platform default"
            value={commission}
            aria-invalid={!bpsValid}
            onChange={(e) => {
              setCommission(e.target.value.replace(/[^\d.]/g, ''));
            }}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(o) => {
          if (!o) setRejecting(null);
        }}
        title={`Reject ${rejecting?.storeName ?? ''}?`}
        confirmLabel="Reject"
        destructive
        reason="Reason (emailed to the applicant, at least 5 characters)"
        reasonRequired
        pending={decide.isPending}
        onConfirm={(reason) => {
          if (rejecting && reason.length >= 5) {
            decide.mutate({ id: rejecting.id, approve: false, reason });
            setRejecting(null);
          } else toast.error('Give a reason of at least 5 characters');
        }}
      />
    </>
  );
}

// ── Sellers ─────────────────────────────────────────────────────────────────

type SellerAction = { seller: AdminSellerRow; to: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' };

export function AdminSellers() {
  const [status, setStatus] = useState<SellerStatus | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<SellerAction | null>(null);
  const [commission, setCommission] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'sellers', status, q, page],
    queryFn: () => adminService.sellers({ page, status: status || undefined, q: q || undefined }),
  });
  const update = useAdminMutation(
    (v: { id: string; to: SellerAction['to']; reason: string; commissionBps?: number }) =>
      adminService.setSellerStatus(v.id, {
        status: v.to,
        ...(v.reason ? { reason: v.reason } : {}),
        ...(v.commissionBps !== undefined ? { commissionBps: v.commissionBps } : {}),
      }),
    'sellers',
    'Seller updated',
  );
  const columns: Column<AdminSellerRow>[] = [
    {
      key: 'store',
      header: 'Store',
      cell: (r) => (
        <span>
          <span className="font-medium">{r.storeName}</span>
          <span className="block text-xs text-muted-foreground">
            {r.owner.name} · {r.owner.email}
          </span>
        </span>
      ),
    },
    { key: 'products', header: 'Products', hideOnMobile: true, cell: (r) => r.productCount },
    {
      key: 'commission',
      header: 'Commission',
      hideOnMobile: true,
      cell: (r) => `${(r.commissionBps / 100).toFixed(2)}%`,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span>
          <StatusBadge status={r.status} />
          {r.statusReason ? (
            <span className="block text-xs text-muted-foreground">{r.statusReason}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          {r.status === 'ACTIVE' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAction({ seller: r, to: 'ACTIVE' });
                setCommission((r.commissionBps / 100).toString());
              }}
            >
              Commission
            </Button>
          ) : null}
          {r.status !== 'ACTIVE' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAction({ seller: r, to: 'ACTIVE' });
                setCommission((r.commissionBps / 100).toString());
              }}
            >
              Activate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAction({ seller: r, to: 'SUSPENDED' });
              }}
            >
              Suspend
            </Button>
          )}
        </div>
      ),
    },
  ];
  const bps = Math.round(Number(commission) * 100);
  const bpsValid = commission === '' || (Number.isFinite(bps) && bps >= 0 && bps <= 5000);
  const activating = action?.to === 'ACTIVE';
  return (
    <>
      <PageHeader
        title="Sellers"
        description="Suspending a seller hides their products from the storefront immediately."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Status"
          value={status}
          options={opts(SELLER_STATUSES)}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <SearchBox
          id="seller-search"
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Sellers"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAction(null);
            setCommission('');
          }
        }}
        title={
          activating
            ? `${action.seller.status === 'ACTIVE' ? 'Update' : 'Activate'} ${action.seller.storeName}`
            : `Suspend ${action?.seller.storeName ?? ''}?`
        }
        confirmLabel={activating ? 'Save' : 'Suspend'}
        destructive={!activating}
        reason={activating ? undefined : 'Reason (shared with the seller)'}
        reasonRequired={!activating}
        pending={update.isPending}
        onConfirm={(reason) => {
          if (!action || !bpsValid) return;
          update.mutate({
            id: action.seller.id,
            to: action.to,
            reason,
            ...(activating && commission !== '' ? { commissionBps: bps } : {}),
          });
          setAction(null);
        }}
      >
        {activating ? (
          <div className="space-y-2">
            <Label htmlFor="seller-commission">Commission (%)</Label>
            <Input
              id="seller-commission"
              inputMode="decimal"
              value={commission}
              aria-invalid={!bpsValid}
              onChange={(e) => {
                setCommission(e.target.value.replace(/[^\d.]/g, ''));
              }}
            />
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
