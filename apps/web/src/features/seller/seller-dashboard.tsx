'use client';

import { SELLER_ORDER_STATUS_LABELS } from '@zyventa/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, IndianRupee, Package, ShoppingBag, Undo2, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import { RevenueChart, StatCard } from '@/components/data/stats';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/use-auth';
import { formatPrice } from '@/lib/format';
import { sellerService } from '@/services/seller.service';

const RANGES = [7, 30, 90] as const;

export function SellerDashboardView() {
  const { user } = useAuth();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const dash = useQuery({
    queryKey: ['seller', 'dashboard', days],
    queryFn: () => sellerService.dashboard(days),
  });
  const d = dash.data;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.seller?.storeName ?? 'seller'}`}
        description="Your store at a glance."
        actions={
          <div
            role="group"
            aria-label="Date range"
            className="inline-flex rounded-md border bg-card p-0.5"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={days === r}
                onClick={() => {
                  setDays(r);
                }}
                className={`rounded px-3 py-1.5 text-sm ${days === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {r} days
              </button>
            ))}
          </div>
        }
      />
      {dash.error ? <Alert variant="error">We couldn’t load your dashboard.</Alert> : null}
      {!d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Revenue"
              value={formatPrice(d.revenue)}
              hint={`Last ${String(days)} days`}
              icon={IndianRupee}
            />
            <StatCard
              label="Orders"
              value={String(d.orders)}
              hint={`${String(d.unitsSold)} units sold`}
              icon={ShoppingBag}
            />
            <StatCard
              label="Average order"
              value={formatPrice(d.averageOrderValue)}
              icon={Package}
            />
            <StatCard
              label="Available balance"
              value={formatPrice(d.balance.available)}
              hint={`${formatPrice(d.balance.pending)} pending`}
              icon={Wallet}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <RevenueChart series={d.series} title="Revenue" />
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-4 shadow-card">
                <p className="font-semibold">Needs attention</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li className="flex justify-between">
                    <Link
                      className="hover:underline"
                      href={'/seller/orders?status=CONFIRMED' as Route}
                    >
                      New orders to process
                    </Link>
                    <span className="font-semibold tabular-nums">
                      {d.ordersByStatus.CONFIRMED ?? 0}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <Link
                      className="hover:underline"
                      href={'/seller/orders?status=PACKED' as Route}
                    >
                      Packed, not shipped
                    </Link>
                    <span className="font-semibold tabular-nums">
                      {d.ordersByStatus.PACKED ?? 0}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <Link className="hover:underline" href="/seller/returns">
                      Open returns
                    </Link>
                    <span className="font-semibold tabular-nums">{d.pendingReturns}</span>
                  </li>
                  <li className="flex justify-between">
                    <Link
                      className="hover:underline"
                      href={'/seller/inventory?filter=low' as Route}
                    >
                      Low stock variants
                    </Link>
                    <span className="font-semibold tabular-nums">{d.lowStockVariants}</span>
                  </li>
                  <li className="flex justify-between">
                    <Link
                      className="hover:underline"
                      href={'/seller/inventory?filter=out' as Route}
                    >
                      Out of stock
                    </Link>
                    <span className="font-semibold tabular-nums">{d.outOfStockVariants}</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-card">
                <p className="font-semibold">Catalogue</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Active</dt>
                    <dd className="font-semibold">{d.products.active}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Drafts</dt>
                    <dd className="font-semibold">{d.products.draft}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Hidden</dt>
                    <dd className="font-semibold">{d.products.inactive}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Blocked</dt>
                    <dd className="font-semibold">{d.products.blocked}</dd>
                  </div>
                </dl>
                {d.products.blocked > 0 ? (
                  <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="size-3.5" aria-hidden="true" /> Some products were
                    blocked by our team.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 shadow-card">
              <p className="font-semibold">Top products</p>
              {d.topProducts.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No sales in this period yet.</p>
              ) : (
                <ol className="mt-3 space-y-2 text-sm">
                  {d.topProducts.map((p) => (
                    <li key={p.productId} className="flex justify-between gap-3">
                      <Link
                        href={`/products/${p.slug}` as Route}
                        className="line-clamp-1 hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {p.units} sold · {formatPrice(p.revenue)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-card">
              <p className="font-semibold">Orders by status (all time)</p>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {Object.entries(d.ordersByStatus).map(([status, n]) => (
                  <li key={status} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {
                        SELLER_ORDER_STATUS_LABELS[
                          status as keyof typeof SELLER_ORDER_STATUS_LABELS
                        ]
                      }
                    </span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
              {d.pendingReturns > 0 ? (
                <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <Undo2 className="size-3.5" aria-hidden="true" /> {d.pendingReturns} returns in
                  progress
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
