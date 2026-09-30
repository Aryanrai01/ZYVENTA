'use client';

import type { InventoryRow } from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/features/cart/use-cart';
import { sellerService } from '@/services/seller.service';

type Filter = 'low' | 'out';
const FILTERS = [
  { value: 'low' as const, label: 'Low stock' },
  { value: 'out' as const, label: 'Out of stock' },
];

function StockCell({ row }: { row: InventoryRow }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(row.stock));
  const save = useMutation({
    mutationFn: () => sellerService.updateStock(row.variantId, { stock: Number(value) }),
    onSuccess: () => {
      toast.success('Stock updated');
      void queryClient.invalidateQueries({ queryKey: ['seller', 'inventory'] });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setValue(String(row.stock));
    },
  });
  const changed = Number(value) !== row.stock && value !== '';
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) save.mutate();
      }}
    >
      <Input
        aria-label={`Stock for ${row.sku}`}
        inputMode="numeric"
        className="h-9 w-24"
        value={value}
        onChange={(e) => {
          setValue(e.target.value.replace(/\D/g, '').slice(0, 7));
        }}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={!changed}
        loading={save.isPending}
      >
        Save
      </Button>
    </form>
  );
}

export function InventoryTable() {
  const initial = useSearchParams().get('filter');
  const [filter, setFilter] = useState<Filter | ''>(
    initial === 'low' || initial === 'out' ? initial : '',
  );
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['seller', 'inventory', filter, q, page],
    queryFn: () => sellerService.inventory({ page, filter: filter || 'all', ...(q ? { q } : {}) }),
  });
  const columns: Column<InventoryRow>[] = [
    {
      key: 'product',
      header: 'Product',
      cell: (r) => (
        <span>
          <span className="line-clamp-1 font-medium">{r.productName}</span>
          <span className="text-xs text-muted-foreground">
            {Object.values(r.options).join(' · ') || 'Default'} · {r.sku}
          </span>
        </span>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      cell: (r) => (
        <span className="flex items-center gap-2 tabular-nums">
          {r.available}
          {r.available === 0 ? (
            <Badge variant="destructive">Out</Badge>
          ) : r.available <= r.lowStockThreshold ? (
            <Badge variant="warning">Low</Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'reserved',
      header: 'Reserved',
      hideOnMobile: true,
      cell: (r) => (
        <span className="tabular-nums" title="Held by unpaid orders">
          {r.reserved}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'On hand',
      cell: (r) => <StockCell key={`${r.variantId}-${String(r.stock)}`} row={r} />,
    },
  ];
  return (
    <>
      <PageHeader
        title="Inventory"
        description="On-hand stock can’t go below units reserved by pending orders."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Show"
          value={filter}
          options={FILTERS}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          allLabel="All variants"
        />
        <label htmlFor="inv-search" className="sr-only">
          Search by name or SKU
        </label>
        <Input
          id="inv-search"
          className="h-9 max-w-64"
          placeholder="Search name or SKU"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Inventory"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.variantId}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No variants match"
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
    </>
  );
}
