'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  Flag,
  IndianRupee,
  MessageSquareWarning,
  PackageOpen,
  ReceiptIndianRupee,
  ShoppingBag,
  Store,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { RevenueChart, StatCard } from '@/components/data/stats';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/lib/format';
import { adminService } from '@/services/admin.service';

const RANGES = [7, 30, 90] as const;

export function AdminDashboardView() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const dash = useQuery({
    queryKey: ['admin', 'dashboard', days],
    queryFn: () => adminService.dashboard(days),
  });
  const d = dash.data;
  return (
    <>
      <PageHeader
        title="Marketplace overview"
        description="Paid orders only. Figures are in rupees, GST inclusive."
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
      {dash.error ? <Alert variant="error">We couldn’t load the dashboard.</Alert> : null}
      {!d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="GMV" value={formatPrice(d.gmv)} icon={IndianRupee} />
            <StatCard
              label="Orders"
              value={String(d.orders)}
              hint={`Avg ${formatPrice(d.averageOrderValue)}`}
              icon={ShoppingBag}
            />
            <StatCard label="Refunded" value={formatPrice(d.refunds)} icon={ReceiptIndianRupee} />
            <StatCard
              label="New customers"
              value={String(d.newUsers)}
              hint={`${String(d.totalUsers)} total`}
              icon={UserPlus}
            />
            <StatCard label="Active sellers" value={String(d.activeSellers)} icon={Store} />
            <StatCard label="Live products" value={String(d.activeProducts)} icon={PackageOpen} />
            <StatCard
              label="Pending applications"
              value={String(d.pendingApplications)}
              icon={BadgeCheck}
              tone={d.pendingApplications > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="Open reports · flagged reviews"
              value={`${String(d.openReports)} · ${String(d.flaggedReviews)}`}
              icon={d.openReports > 0 ? Flag : MessageSquareWarning}
              tone={d.openReports + d.flaggedReviews > 0 ? 'warning' : 'default'}
            />
          </div>
          <RevenueChart series={d.series} title="Daily GMV" />
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-5 shadow-card">
              <h2 className="font-semibold">Top categories</h2>
              <RankList
                rows={d.topCategories.map((c) => ({
                  key: c.name,
                  label: c.name,
                  value: c.revenue,
                  meta: `${String(c.units)} units`,
                }))}
              />
            </section>
            <section className="rounded-xl border bg-card p-5 shadow-card">
              <h2 className="flex items-center justify-between font-semibold">
                Top sellers
                <Link href="/admin/sellers" className="text-sm font-normal text-primary">
                  All sellers
                </Link>
              </h2>
              <RankList
                rows={d.topSellers.map((s) => ({
                  key: s.id,
                  label: s.storeName,
                  value: s.revenue,
                  meta: `${String(s.orders)} orders`,
                }))}
              />
            </section>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden="true" /> Range {d.range.from.slice(0, 10)} to{' '}
            {d.range.to.slice(0, 10)}
          </p>
        </div>
      )}
    </>
  );
}

function RankList({
  rows,
}: {
  rows: { key: string; label: string; value: number; meta: string }[];
}) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-muted-foreground">No sales yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="mt-3 space-y-3">
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums">{formatPrice(r.value)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${String((r.value / max) * 100)}%` }}
              />
            </div>
            <span className="w-20 text-right text-xs text-muted-foreground">{r.meta}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
