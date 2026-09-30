import type { Metadata } from 'next';
import { parseFilters, type SearchParamsRecord } from '@/features/catalog/filters';
import { ListingView } from '@/features/catalog/listing-view';

export const metadata: Metadata = {
  title: 'All products',
  description: 'Browse every product on ZYVENTA — filter by brand, price, rating and more.',
  alternates: { canonical: '/products' },
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const filters = parseFilters(await searchParams);
  filters.sort ??= 'popular';
  return (
    <ListingView
      title="All products"
      breadcrumbs={[{ name: 'Home', href: '/' }, { name: 'All products' }]}
      filters={filters}
      basePath="/products"
    />
  );
}
