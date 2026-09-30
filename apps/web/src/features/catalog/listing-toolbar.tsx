'use client';

import { PRODUCT_SORTS, PRODUCT_SORT_LABELS, type ProductSort } from '@zyventa/shared';
import { SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { activeFilterCount } from './filters';
import { FilterPanel, type FilterPanelProps } from './filter-panel';
import { useFilterNavigation } from './use-filter-navigation';

export function SortSelect({
  filters,
  basePath,
  omit,
  hasQuery,
}: Omit<FilterPanelProps, 'facets'> & { hasQuery: boolean }) {
  const id = useId();
  const { apply, pending } = useFilterNavigation(basePath, filters, omit);
  // Relevance only makes sense for a text search.
  const sorts = PRODUCT_SORTS.filter((s) => s !== 'relevance' || hasQuery);
  const value = filters.sort ?? (hasQuery ? 'relevance' : 'popular');

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="hidden text-sm text-muted-foreground sm:block">
        Sort by
      </label>
      <select
        id={id}
        value={value}
        aria-busy={pending}
        onChange={(e) => {
          apply({ sort: e.target.value as ProductSort });
        }}
        className="h-10 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        {sorts.map((sort) => (
          <option key={sort} value={sort}>
            {PRODUCT_SORT_LABELS[sort]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Filters in a bottom sheet on phones/tablets. */
export function MobileFilters(props: FilterPanelProps) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(props.filters);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="md" className="lg:hidden">
          <SlidersHorizontal aria-hidden="true" />
          Filters{count > 0 ? ` (${String(count)})` : ''}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        title="Filters"
        footer={
          <Button
            fullWidth
            onClick={() => {
              setOpen(false);
            }}
          >
            Show results
          </Button>
        }
      >
        <div className="px-4 pb-4">
          <FilterPanel {...props} showHeading={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
