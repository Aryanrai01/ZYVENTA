import type { CategoryNode } from '@zyventa/shared';
import type { Metadata, Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { catalogService } from '@/services/catalog.service';

export const metadata: Metadata = {
  title: 'All categories',
  description: 'Every category on ZYVENTA, from electronics to groceries.',
  alternates: { canonical: '/categories' },
};

export default async function CategoriesPage() {
  let categories: CategoryNode[] = [];
  try {
    categories = await catalogService.categories({
      next: { revalidate: 300, tags: ['categories'] },
    });
  } catch {
    categories = [];
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'All categories' }]} />
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">All categories</h1>

      {categories.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Categories are unavailable right now.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((root) => (
            <li key={root.id} className="rounded-xl border bg-card p-4 shadow-card">
              <Link
                href={`/categories/${root.slug}` as Route}
                className="group flex items-center gap-3"
              >
                <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-primary-soft">
                  {root.image ? (
                    <Image
                      src={root.image.url}
                      alt=""
                      fill
                      sizes="56px"
                      unoptimized={root.image.url.endsWith('.svg')}
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-primary">
                      <CategoryIcon name={root.icon} className="size-7" />
                    </span>
                  )}
                </span>
                <span className="font-semibold group-hover:text-primary group-hover:underline">
                  {root.name}
                </span>
              </Link>
              {root.children.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                  {root.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/categories/${child.slug}` as Route}
                        className="hover:text-foreground hover:underline"
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
