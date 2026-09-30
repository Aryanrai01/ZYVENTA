import type { CategoryNode } from '@zyventa/shared';
import Link from 'next/link';
import type { Route } from 'next';
import { Suspense } from 'react';
import { SearchBox } from '@/features/search/search-box';
import { catalogService } from '@/services/catalog.service';
import { HeaderActions } from './header-actions';
import { Logo } from './logo';
import { MobileMenu } from './mobile-menu';

async function loadCategories(): Promise<CategoryNode[]> {
  try {
    return await catalogService.categories({ next: { revalidate: 300, tags: ['categories'] } });
  } catch {
    // The header must render even if the catalogue API is briefly unavailable.
    return [];
  }
}

function SearchFallback() {
  return <div className="h-11 rounded-lg border bg-muted/60 sm:h-10" aria-hidden="true" />;
}

async function loadMaintenance(): Promise<string | null> {
  try {
    const s = await catalogService.settings({ next: { revalidate: 60, tags: ['settings'] } });
    return s.maintenance.enabled
      ? s.maintenance.message || 'Checkout is paused for scheduled maintenance.'
      : null;
  } catch {
    return null;
  }
}

/** Storefront header: logo, search with suggestions, cart/wishlist/account, category bar. */
export async function SiteHeader() {
  const [categories, maintenance] = await Promise.all([loadCategories(), loadMaintenance()]);

  return (
    <>
      {maintenance ? (
        <div
          role="status"
          className="bg-warning px-4 py-2 text-center text-sm text-warning-foreground"
        >
          {maintenance}
        </div>
      ) : null}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <MobileMenu categories={categories} />
          <Logo className="shrink-0" />
          <div className="hidden flex-1 md:block md:max-w-2xl lg:mx-6">
            <Suspense fallback={<SearchFallback />}>
              <SearchBox />
            </Suspense>
          </div>
          <div className="ml-auto">
            <HeaderActions />
          </div>
        </div>

        <div className="px-4 pb-3 md:hidden">
          <Suspense fallback={<SearchFallback />}>
            <SearchBox />
          </Suspense>
        </div>

        {categories.length > 0 ? (
          <nav aria-label="Categories" className="hidden border-t lg:block">
            <ul className="mx-auto flex h-11 max-w-7xl items-center gap-1 overflow-x-auto px-6 text-sm lg:px-8">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/categories/${category.slug}` as Route}
                    className="block rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
              <li className="ml-auto">
                <Link
                  href="/products?sort=discount"
                  className="block rounded-md px-3 py-1.5 font-medium whitespace-nowrap text-primary hover:bg-primary-soft"
                >
                  Today’s deals
                </Link>
              </li>
            </ul>
          </nav>
        ) : null}
      </header>
    </>
  );
}
