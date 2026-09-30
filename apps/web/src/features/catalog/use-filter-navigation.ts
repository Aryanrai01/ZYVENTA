'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { ProductFilters } from '@/services/catalog.service';
import { filtersToSearch } from './filters';

/** Applies a filter change by navigating (URL is the source of truth); page resets to 1. */
export function useFilterNavigation(
  basePath: string,
  filters: ProductFilters,
  omit: (keyof ProductFilters)[],
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = (change: Partial<ProductFilters>, { keepPage = false } = {}) => {
    const next: ProductFilters = { ...filters, ...change };
    if (!keepPage) next.page = 1;
    for (const key of Object.keys(change) as (keyof ProductFilters)[]) {
      if (change[key] === undefined) Reflect.deleteProperty(next, key);
    }
    startTransition(() => {
      router.push(`${basePath}${filtersToSearch(next, omit)}` as Route, { scroll: false });
    });
  };

  const clearAll = () => {
    const kept: ProductFilters = {};
    if (filters.q) kept.q = filters.q;
    if (filters.category) kept.category = filters.category;
    if (filters.sort) kept.sort = filters.sort;
    startTransition(() => {
      router.push(`${basePath}${filtersToSearch(kept, omit)}` as Route, { scroll: false });
    });
  };

  return { apply, clearAll, pending };
}
