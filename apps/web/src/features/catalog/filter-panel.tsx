'use client';

import type { FacetValue, ProductFacets } from '@zyventa/shared';
import { Star } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ProductFilters } from '@/services/catalog.service';
import { activeFilterCount, toggleValue, withList } from './filters';
import { useFilterNavigation } from './use-filter-navigation';

export interface FilterPanelProps {
  facets: ProductFacets | null;
  filters: ProductFilters;
  basePath: string;
  omit: (keyof ProductFilters)[];
}

const OPTION_LABELS: Record<string, string> = {
  color: 'Colour',
  size: 'Size',
  storage: 'Storage',
  ram: 'RAM',
  material: 'Material',
  model: 'Model',
};
const DISCOUNTS = [10, 25, 40, 60];
const RATINGS = [4, 3];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-b py-4 last:border-b-0">
      <legend className="float-left mb-2 w-full text-sm font-semibold">{title}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

function CheckList({
  values,
  selected,
  onToggle,
  initialVisible = 6,
}: {
  values: FacetValue[];
  selected: string[] | undefined;
  onToggle: (value: string) => void;
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // Selected values always stay visible, even when they'd fall below the fold.
  const ordered = [
    ...values.filter((v) => selected?.includes(v.value)),
    ...values.filter((v) => !selected?.includes(v.value)),
  ];
  const visible = expanded
    ? ordered
    : ordered.slice(0, Math.max(initialVisible, selected?.length ?? 0));
  return (
    <>
      <ul className="space-y-1">
        {visible.map((facet) => {
          const checked = selected?.includes(facet.value) ?? false;
          return (
            <li key={facet.value}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md py-1 text-sm hover:text-foreground">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    onToggle(facet.value);
                  }}
                  className="size-4 rounded border-input accent-primary"
                />
                <span className="flex-1 truncate">{facet.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{facet.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {values.length > initialVisible ? (
        <button
          type="button"
          onClick={() => {
            setExpanded((e) => !e);
          }}
          className="mt-1 text-sm font-medium text-primary hover:underline"
        >
          {expanded ? 'Show less' : `Show all ${String(values.length)}`}
        </button>
      ) : null}
    </>
  );
}

function PriceRange({
  filters,
  range,
  onApply,
}: {
  filters: ProductFilters;
  range: ProductFacets['priceRange'];
  onApply: (min: number | undefined, max: number | undefined) => void;
}) {
  const id = useId();
  const [min, setMin] = useState(filters.minPrice?.toString() ?? '');
  const [max, setMax] = useState(filters.maxPrice?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const lo = min ? Number(min) : undefined;
    const hi = max ? Number(max) : undefined;
    if (
      (lo !== undefined && !Number.isInteger(lo)) ||
      (hi !== undefined && !Number.isInteger(hi))
    ) {
      setError('Use whole rupees');
      return;
    }
    if (lo !== undefined && hi !== undefined && lo > hi) {
      setError('Minimum cannot exceed maximum');
      return;
    }
    setError(null);
    onApply(lo, hi);
  };

  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      {range ? (
        <p className="text-xs text-muted-foreground">
          {formatPrice(range.min)} – {formatPrice(range.max)}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-min`} className="sr-only">
          Minimum price in rupees
        </label>
        <Input
          id={`${id}-min`}
          inputMode="numeric"
          placeholder="Min ₹"
          value={min}
          onChange={(e) => {
            setMin(e.target.value.replace(/\D/g, '').slice(0, 8));
          }}
          className="h-10"
        />
        <span aria-hidden="true" className="text-muted-foreground">
          –
        </span>
        <label htmlFor={`${id}-max`} className="sr-only">
          Maximum price in rupees
        </label>
        <Input
          id={`${id}-max`}
          inputMode="numeric"
          placeholder="Max ₹"
          value={max}
          onChange={(e) => {
            setMax(e.target.value.replace(/\D/g, '').slice(0, 8));
          }}
          className="h-10"
        />
        <Button type="submit" variant="outline" size="sm" className="h-10">
          Go
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function RadioList<T extends number>({
  name,
  options,
  value,
  label,
  onChange,
}: {
  name: string;
  options: T[];
  value: T | undefined;
  label: (option: T) => ReactNode;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <ul className="space-y-1">
      {options.map((option) => (
        <li key={option}>
          <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm">
            <input
              type="radio"
              name={name}
              checked={value === option}
              onChange={() => {
                onChange(option);
              }}
              onClick={() => {
                // Clicking the selected option clears it.
                if (value === option) onChange(undefined);
              }}
              className="size-4 accent-primary"
            />
            {label(option)}
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Faceted filters. Every change navigates, so the URL always describes the view. */
export function FilterPanel({
  facets,
  filters,
  basePath,
  omit,
  showHeading = true,
}: FilterPanelProps & { showHeading?: boolean }) {
  const { apply, clearAll, pending } = useFilterNavigation(basePath, filters, omit);
  const count = activeFilterCount(filters);

  return (
    <div aria-busy={pending} className={cn('transition-opacity', pending && 'opacity-60')}>
      <div className="flex items-center justify-between pb-2">
        {showHeading ? <h2 className="text-base font-semibold">Filters</h2> : <span />}
        {count > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm font-medium text-primary hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <Section title="Availability">
        <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm">
          <input
            type="checkbox"
            checked={filters.inStock === true}
            onChange={(e) => {
              apply({ inStock: e.target.checked ? true : undefined });
            }}
            className="size-4 rounded accent-primary"
          />
          In stock only
          {facets ? (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {facets.inStockCount}
            </span>
          ) : null}
        </label>
      </Section>

      <Section title="Price">
        <PriceRange
          key={`${String(filters.minPrice)}-${String(filters.maxPrice)}`}
          filters={filters}
          range={facets?.priceRange ?? null}
          onApply={(minPrice, maxPrice) => {
            apply({ minPrice, maxPrice });
          }}
        />
      </Section>

      {facets && facets.brands.length > 0 ? (
        <Section title="Brand">
          <CheckList
            values={facets.brands}
            selected={filters.brand}
            onToggle={(value) => {
              apply({ brand: toggleValue(filters.brand, value) });
            }}
          />
        </Section>
      ) : null}

      {facets?.options.map((option) =>
        option.values.length > 0 ? (
          <Section key={option.key} title={OPTION_LABELS[option.key] ?? option.key}>
            <CheckList
              values={option.values}
              selected={filters.options?.[option.key]}
              onToggle={(value) => {
                apply({
                  options: withList(
                    filters.options,
                    option.key,
                    toggleValue(filters.options?.[option.key], value),
                  ),
                });
              }}
            />
          </Section>
        ) : null,
      )}

      {facets?.attributes.map((attribute) =>
        attribute.values.length > 0 ? (
          <Section key={attribute.key} title={attribute.label}>
            <CheckList
              values={attribute.values}
              selected={filters.attributes?.[attribute.key]}
              onToggle={(value) => {
                apply({
                  attributes: withList(
                    filters.attributes,
                    attribute.key,
                    toggleValue(filters.attributes?.[attribute.key], value),
                  ),
                });
              }}
            />
          </Section>
        ) : null,
      )}

      <Section title="Customer rating">
        <RadioList
          name="rating"
          options={RATINGS}
          value={filters.rating}
          onChange={(rating) => {
            apply({ rating });
          }}
          label={(r) => (
            <span className="inline-flex items-center gap-1">
              {r}
              <Star className="size-3.5 fill-current text-rating" aria-hidden="true" />& above
            </span>
          )}
        />
      </Section>

      <Section title="Discount">
        <RadioList
          name="discount"
          options={DISCOUNTS}
          value={filters.discount}
          onChange={(discount) => {
            apply({ discount });
          }}
          label={(d) => `${String(d)}% or more`}
        />
      </Section>
    </div>
  );
}
