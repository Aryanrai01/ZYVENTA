import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { parseFilters, type SearchParamsRecord } from '@/features/catalog/filters';
import { ListingView } from '@/features/catalog/listing-view';

type Props = { searchParams: Promise<SearchParamsRecord> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = parseFilters(await searchParams).q;
  return {
    title: q ? `Results for “${q}”` : 'Search',
    // Search result pages are thin/duplicate content for crawlers.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  if (!filters.q) redirect('/products');
  return (
    <ListingView
      title={`Results for “${filters.q}”`}
      breadcrumbs={[{ name: 'Home', href: '/' }, { name: 'Search' }]}
      filters={filters}
      basePath="/search"
    />
  );
}
