'use client';

import type { PaginationMeta } from '@zyventa/shared';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/feedback/empty-state';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on small screens (the table still scrolls horizontally). */
  hideOnMobile?: boolean;
}

/**
 * Generic data table for dashboards: loading skeleton, error, empty state and a
 * horizontally scrolling body on narrow screens.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  caption,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: unknown;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  caption: string;
  onRowClick?: (row: T) => void;
}) {
  if (error) {
    return <Alert variant="error">We couldn’t load this list. Please refresh the page.</Alert>;
  }
  if (!isLoading && rows?.length === 0) {
    return <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground uppercase">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'px-4 py-3 font-medium',
                  c.hideOnMobile && 'hidden md:table-cell',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {isLoading || !rows
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} aria-hidden="true">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn('px-4 py-3', c.hideOnMobile && 'hidden md:table-cell')}
                    >
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={cn(onRowClick && 'cursor-pointer hover:bg-muted/40')}
                  onClick={
                    onRowClick
                      ? () => {
                          onRowClick(row);
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-3 align-middle',
                        c.hideOnMobile && 'hidden md:table-cell',
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({
  meta,
  onPage,
}: {
  meta: PaginationMeta | undefined;
  onPage: (page: number) => void;
}) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!meta.hasPreviousPage}
          onClick={() => {
            onPage(meta.page - 1);
          }}
        >
          <ChevronLeft aria-hidden="true" /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!meta.hasNextPage}
          onClick={() => {
            onPage(meta.page + 1);
          }}
        >
          Next <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function FilterSelect<V extends string>({
  label,
  value,
  options,
  onChange,
  allLabel = 'All',
}: {
  label: string;
  value: V | '';
  options: readonly { value: V; label: string }[];
  onChange: (value: V | '') => void;
  allLabel?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value as V | '');
        }}
        className="h-9 rounded-md border border-input bg-card px-2 text-sm"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
