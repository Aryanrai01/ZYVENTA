'use client';

import type { SearchSuggestion } from '@zyventa/shared';
import { useQuery } from '@tanstack/react-query';
import { Folder, Search, Tag, X } from 'lucide-react';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { catalogService } from '@/services/catalog.service';

export function suggestionHref(s: SearchSuggestion): Route {
  switch (s.type) {
    case 'product':
      return `/products/${s.slug}` as Route;
    case 'category':
      return `/categories/${s.slug}` as Route;
    case 'brand':
      return `/products?brand=${encodeURIComponent(s.slug)}` as Route;
  }
}

const ICONS = { product: Search, category: Folder, brand: Tag } as const;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}

/**
 * Search with autocomplete, following the WAI-ARIA combobox pattern: arrow keys move through
 * suggestions, Enter opens the highlighted one (or searches), Escape closes the list.
 */
export function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const initial = useSearchParams().get('q') ?? '';
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const term = useDebounced(value.trim(), 200);

  const { data: suggestions = [] } = useQuery({
    queryKey: ['search-suggestions', term],
    queryFn: ({ signal }) => catalogService.suggestions(term, signal),
    enabled: term.length >= 2,
    staleTime: 5 * 60_000,
  });
  const visible = open && term.length >= 2 && suggestions.length > 0;

  const go = (href: Route) => {
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const chosen = visible && active >= 0 ? suggestions[active] : undefined;
    if (chosen) {
      go(suggestionHref(chosen));
      return;
    }
    const q = value.trim();
    if (q) go(`/search?q=${encodeURIComponent(q)}` as Route);
  };

  return (
    <form role="search" onSubmit={onSubmit} className={cn('relative', className)}>
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search products, brands and categories
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `${listId}-${String(active)}` : undefined}
        autoComplete="off"
        enterKeyHint="search"
        maxLength={100}
        autoFocus={autoFocus}
        placeholder="Search for products, brands and more"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          // Let a click on a suggestion land first.
          setTimeout(() => {
            setOpen(false);
          }, 120);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          } else if (event.key === 'ArrowDown' && suggestions.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % suggestions.length);
          } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
            event.preventDefault();
            setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          }
        }}
        className="h-11 w-full rounded-lg border border-input bg-muted/60 pr-10 pl-9 text-base placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring sm:h-10 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue('');
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      <ul
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!visible}
        className="absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-overlay"
      >
        {suggestions.map((s, index) => {
          const Icon = ICONS[s.type];
          return (
            <li
              key={`${s.type}-${s.slug}`}
              id={`${listId}-${String(index)}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                go(suggestionHref(s));
              }}
              onMouseEnter={() => {
                setActive(index);
              }}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
                index === active && 'bg-muted',
              )}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 truncate">{s.label}</span>
              {s.type !== 'product' ? (
                <span className="text-xs text-muted-foreground capitalize">{s.type}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </form>
  );
}
