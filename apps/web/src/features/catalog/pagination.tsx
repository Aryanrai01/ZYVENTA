import type { PaginationMeta } from '@zyventa/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { cn } from '@/lib/utils';
import type { ProductFilters } from '@/services/catalog.service';
import { filtersToSearch } from './filters';

/** Page numbers around the current page, with gaps: 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(current: number, total: number): (number | 'gap')[] {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((page, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && page - prev > 1) out.push('gap');
    out.push(page);
  });
  return out;
}

export function Pagination({
  meta,
  filters,
  basePath,
  omit,
}: {
  meta: PaginationMeta;
  filters: ProductFilters;
  basePath: string;
  omit: (keyof ProductFilters)[];
}) {
  if (meta.totalPages <= 1) return null;
  const href = (page: number) =>
    `${basePath}${filtersToSearch({ ...filters, page }, omit)}` as Route;
  const linkClass =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-md border bg-card px-3 text-sm hover:bg-muted';

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      {meta.hasPreviousPage ? (
        <Link href={href(meta.page - 1)} className={linkClass} rel="prev">
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Previous</span>
        </Link>
      ) : null}
      <ul className="flex items-center gap-1.5">
        {pageWindow(meta.page, meta.totalPages).map((page, i) =>
          page === 'gap' ? (
            <li key={`gap-${String(i)}`} aria-hidden="true" className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={page} className={cn(page !== meta.page && 'hidden sm:block')}>
              <Link
                href={href(page)}
                aria-current={page === meta.page ? 'page' : undefined}
                className={cn(
                  linkClass,
                  page === meta.page &&
                    'border-primary bg-primary text-primary-foreground hover:bg-primary',
                )}
              >
                <span className="sr-only">Page </span>
                {page}
              </Link>
            </li>
          ),
        )}
      </ul>
      {meta.hasNextPage ? (
        <Link href={href(meta.page + 1)} className={linkClass} rel="next">
          <span className="sr-only sm:not-sr-only">Next</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
