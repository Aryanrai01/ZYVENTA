'use client';

import type { TimeSeriesPoint } from '@zyventa/shared';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'warning';
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon ? (
          <Icon
            className={cn(
              'size-4',
              tone === 'warning' ? 'text-warning-foreground' : 'text-muted-foreground',
            )}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/**
 * Single-series daily revenue bars: one hue, rounded data-ends on a baseline, recessive
 * axis, per-bar hover/focus tooltip, and a table fallback for screen readers.
 */
export function RevenueChart({ series, title }: { series: TimeSeriesPoint[]; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((p) => p.revenue));
  const point = active !== null ? series[active] : undefined;
  const total = series.reduce((s, p) => s + p.revenue, 0);

  return (
    <figure className="rounded-xl border bg-card p-4 shadow-card">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatPrice(total)} total
        </span>
      </figcaption>
      <div
        className="relative mt-4 h-44"
        onMouseLeave={() => {
          setActive(null);
        }}
      >
        <div
          className="absolute inset-x-0 top-0 border-t border-dashed border-border"
          aria-hidden="true"
        />
        <span
          className="absolute -top-2 right-0 bg-card pl-1 text-[10px] text-muted-foreground tabular-nums"
          aria-hidden="true"
        >
          {formatPrice(max)}
        </span>
        <div className="flex h-full items-end gap-[2px] border-b border-border" aria-hidden="true">
          {series.map((p, i) => (
            <button
              key={p.date}
              type="button"
              tabIndex={-1}
              className="group flex h-full flex-1 items-end"
              onMouseEnter={() => {
                setActive(i);
              }}
              onFocus={() => {
                setActive(i);
              }}
            >
              <span
                className={cn(
                  'w-full rounded-t-[4px] bg-primary transition-opacity',
                  active !== null && active !== i && 'opacity-40',
                )}
                style={{
                  height: `${String(Math.max(p.revenue > 0 ? 2 : 0, (p.revenue / max) * 100))}%`,
                }}
              />
            </button>
          ))}
        </div>
        {point ? (
          <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-3 py-1.5 text-xs shadow-overlay">
            <span className="font-medium">{shortDate.format(new Date(point.date))}</span> ·{' '}
            {formatPrice(point.revenue)} · {point.orders} {point.orders === 1 ? 'order' : 'orders'}
          </div>
        ) : null}
      </div>
      <div
        className="mt-2 flex justify-between text-[11px] text-muted-foreground"
        aria-hidden="true"
      >
        <span>{series[0] ? shortDate.format(new Date(series[0].date)) : ''}</span>
        <span>{series.at(-1) ? shortDate.format(new Date(series.at(-1)?.date ?? '')) : ''}</span>
      </div>
      <table className="sr-only">
        <caption>{title} by day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Revenue</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{formatPrice(p.revenue)}</td>
              <td>{p.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
