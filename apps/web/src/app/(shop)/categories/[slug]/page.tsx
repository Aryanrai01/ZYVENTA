import type { CategoryDetail } from '@zyventa/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { parseFilters, type SearchParamsRecord } from '@/features/catalog/filters';
import { ListingView } from '@/features/catalog/listing-view';
import { ApiClientError } from '@/lib/api-client';
import { catalogService } from '@/services/catalog.service';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParamsRecord>;
};

/** Deduplicated between generateMetadata and the page within one request. */
const getCategory = cache(async (slug: string): Promise<CategoryDetail> => {
  try {
    return await catalogService.category(slug, { next: { revalidate: 300, tags: ['categories'] } });
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategory((await params).slug);
  const title = category.seo.title || category.name;
  const description =
    category.seo.description ||
    category.description ||
    `Shop ${category.name} on ZYVENTA from verified sellers.`;
  return {
    title,
    description,
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: { title, description },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await getCategory(slug);
  const filters = parseFilters(await searchParams, { category: category.slug });
  filters.sort ??= 'popular';

  const crumbs = [
    { name: 'Home', href: '/' as Route },
    ...category.breadcrumbs.map((b) => ({
      name: b.name,
      href: `/categories/${b.slug}` as Route,
    })),
  ];

  return (
    <ListingView
      title={category.name}
      description={category.description || undefined}
      breadcrumbs={crumbs}
      filters={filters}
      basePath={`/categories/${category.slug}`}
      omit={['category']}
      aside={
        category.children.length > 0 ? (
          <ul className="-mx-4 scrollbar-none flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {category.children.map((child) => (
              <li key={child.id} className="shrink-0">
                <Link
                  href={`/categories/${child.slug}` as Route}
                  className="inline-flex h-9 items-center rounded-full border bg-card px-4 text-sm hover:border-primary hover:text-primary"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null
      }
    />
  );
}
