'use client';

import { PRODUCT_STATUSES, type ProductStatus, type SellerProductRow } from '@zyventa/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { StatusBadge, humanize } from '@/components/data/status-badge';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/lib/format';
import { sellerService } from '@/services/seller.service';
import { ProductEditor } from './product-editor';

export function SellerProductList() {
  const router = useRouter();
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['seller', 'products', status, q, page],
    queryFn: () =>
      sellerService.products({ page, ...(status ? { status } : {}), ...(q ? { q } : {}) }),
  });
  const columns: Column<SellerProductRow>[] = [
    {
      key: 'name',
      header: 'Product',
      cell: (p) => (
        <span className="flex items-center gap-3">
          {p.image ? (
            <Image
              src={p.image.url}
              alt=""
              width={40}
              height={40}
              className="size-10 rounded border bg-muted object-contain"
            />
          ) : (
            <span className="size-10 rounded border bg-muted" />
          )}
          <Link
            href={`/seller/products/${p.id}` as Route}
            className="line-clamp-2 font-medium hover:underline"
          >
            {p.name}
          </Link>
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      cell: (p) => (
        <span className="tabular-nums">
          {p.priceMin === p.priceMax
            ? formatPrice(p.priceMin)
            : `${formatPrice(p.priceMin)} – ${formatPrice(p.priceMax)}`}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Available',
      hideOnMobile: true,
      cell: (p) => (
        <span className="tabular-nums">
          {p.totalAvailable}
          {p.lowStockVariants > 0 ? (
            <span className="ml-1 text-xs text-warning-foreground">({p.lowStockVariants} low)</span>
          ) : null}
        </span>
      ),
    },
    { key: 'sold', header: 'Sold', hideOnMobile: true, cell: (p) => p.soldCount },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
  ];
  return (
    <>
      <PageHeader
        title="Products"
        actions={
          <Button asChild>
            <Link href="/seller/products/new">
              <Plus aria-hidden="true" /> Add product
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Status"
          value={status}
          options={PRODUCT_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <label htmlFor="product-search" className="sr-only">
          Search products
        </label>
        <Input
          id="product-search"
          className="h-9 max-w-64"
          placeholder="Search products"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Your products"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No products yet"
        emptyDescription="Add your first product to start selling."
        onRowClick={(r) => {
          router.push(`/seller/products/${r.id}` as Route);
        }}
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
    </>
  );
}

export function SellerProductEdit({ id }: { id: string }) {
  const product = useQuery({
    queryKey: ['seller', 'product', id],
    queryFn: () => sellerService.product(id),
  });
  if (product.error) return <Alert variant="error">Product not found.</Alert>;
  if (!product.data) return <Skeleton className="h-96 rounded-xl" />;
  return <ProductEditor key={product.data.id} product={product.data} />;
}
