'use client';

import {
  GST_RATES_BPS,
  PRODUCT_STATUSES,
  type AdminProductRow,
  type BrandSummary,
  type ProductModerationInput,
  type ProductStatus,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/data/confirm';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { StatusBadge, humanize } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { errorMessage } from '@/features/cart/use-cart';
import { formatPrice } from '@/lib/format';
import { adminService, type AdminCategoryRow } from '@/services/admin.service';

// ── Product moderation ──────────────────────────────────────────────────────

export function AdminProducts() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [blocking, setBlocking] = useState<AdminProductRow | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'products', status, q, page],
    queryFn: () => adminService.products({ page, status: status || undefined, q: q || undefined }),
  });
  const moderate = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductModerationInput }) =>
      adminService.moderateProduct(id, input),
    onSuccess: () => {
      toast.success('Product updated');
      setBlocking(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns: Column<AdminProductRow>[] = [
    {
      key: 'product',
      header: 'Product',
      cell: (r) => (
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
            {r.image ? (
              <Image src={r.image} alt="" fill sizes="40px" className="object-cover" />
            ) : null}
          </div>
          <span className="min-w-0">
            <Link
              href={`/products/${r.slug}` as Route}
              className="line-clamp-1 font-medium hover:underline"
            >
              {r.name}
            </Link>
            <span className="block text-xs text-muted-foreground">
              {r.seller.storeName} · {r.category}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'From',
      hideOnMobile: true,
      className: 'text-right',
      cell: (r) => <span className="tabular-nums">{formatPrice(r.priceMin)}</span>,
    },
    { key: 'sold', header: 'Sold', hideOnMobile: true, cell: (r) => r.soldCount },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          <StatusBadge status={r.status} />
          {r.isFeatured ? (
            <Star className="size-4 fill-accent text-accent" aria-label="Featured" />
          ) : null}
          {r.statusReason ? (
            <span className="block w-full text-xs text-muted-foreground">{r.statusReason}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          {r.status === 'ACTIVE' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                moderate.mutate({
                  id: r.id,
                  input: { action: r.isFeatured ? 'UNFEATURE' : 'FEATURE' },
                });
              }}
            >
              {r.isFeatured ? 'Unfeature' : 'Feature'}
            </Button>
          ) : null}
          {r.status === 'BLOCKED' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                moderate.mutate({ id: r.id, input: { action: 'UNBLOCK' } });
              }}
            >
              Unblock
            </Button>
          ) : r.status !== 'ARCHIVED' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setBlocking(r);
              }}
            >
              Block
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Products"
        description="Blocked products are removed from the storefront and search at once."
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
        <label className="sr-only" htmlFor="product-search">
          Search products
        </label>
        <Input
          id="product-search"
          placeholder="Search products"
          className="h-9 max-w-64"
          onChange={(e) => {
            setQ(e.target.value.trim());
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Products"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
      <ConfirmDialog
        open={blocking !== null}
        onOpenChange={(o) => {
          if (!o) setBlocking(null);
        }}
        title={`Block “${blocking?.name ?? ''}”?`}
        confirmLabel="Block"
        destructive
        reason="Reason (shared with the seller)"
        reasonRequired
        pending={moderate.isPending}
        onConfirm={(reason) => {
          if (blocking) moderate.mutate({ id: blocking.id, input: { action: 'BLOCK', reason } });
        }}
      />
    </>
  );
}

// ── Categories & brands ─────────────────────────────────────────────────────

interface CategoryDraft {
  id?: string;
  name: string;
  parentId: string;
  gstRateBps: number;
  sortOrder: string;
  isActive: boolean;
  isFeatured: boolean;
}
const emptyCategory: CategoryDraft = {
  name: '',
  parentId: '',
  gstRateBps: 1800,
  sortOrder: '0',
  isActive: true,
  isFeatured: false,
};

export function AdminCatalog() {
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: adminService.categories,
  });
  const brands = useQuery({ queryKey: ['admin', 'brands'], queryFn: adminService.brands });
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [brandDraft, setBrandDraft] = useState<{ id?: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{
    kind: 'category' | 'brand';
    id: string;
    name: string;
  } | null>(null);
  const done = (msg: string) => {
    toast.success(msg);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'brands'] });
  };
  const saveCategory = useMutation({
    mutationFn: async (d: CategoryDraft) => {
      const sortOrder = Number.parseInt(d.sortOrder, 10) || 0;
      const common = {
        name: d.name.trim(),
        parentId: d.parentId || null,
        gstRateBps: d.gstRateBps as (typeof GST_RATES_BPS)[number],
        sortOrder,
        isActive: d.isActive,
        isFeatured: d.isFeatured,
      };
      return d.id
        ? adminService.updateCategory(d.id, common)
        : adminService.createCategory({
            ...common,
            description: '',
            filterableAttributes: [],
            seo: {},
          });
    },
    onSuccess: () => {
      setDraft(null);
      done('Category saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveBrand = useMutation({
    mutationFn: (d: { id?: string; name: string }) =>
      d.id
        ? adminService.updateBrand(d.id, { name: d.name.trim() })
        : adminService.createBrand({
            name: d.name.trim(),
            description: '',
            isActive: true,
            isFeatured: false,
          }),
    onSuccess: () => {
      setBrandDraft(null);
      done('Brand saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggleBrandFeatured = useMutation({
    mutationFn: (b: BrandSummary) => adminService.updateBrand(b.id, { isFeatured: !b.isFeatured }),
    onSuccess: () => {
      done('Brand updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (d: { kind: 'category' | 'brand'; id: string }) =>
      d.kind === 'category' ? adminService.deleteCategory(d.id) : adminService.deleteBrand(d.id),
    onSuccess: () => {
      setDeleting(null);
      done('Deleted');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = categories.data;
  const byId = new Map(rows?.map((c) => [c.id, c]));
  const catColumns: Column<AdminCategoryRow>[] = [
    {
      key: 'name',
      header: 'Category',
      cell: (c) => (
        <span style={{ paddingLeft: `${String(c.level * 16)}px` }} className="block">
          <span className="font-medium">{c.name}</span>
          <span className="block text-xs text-muted-foreground">/{c.slug}</span>
        </span>
      ),
    },
    {
      key: 'gst',
      header: 'GST',
      hideOnMobile: true,
      cell: (c) => `${String(c.gstRateBps / 100)}%`,
    },
    { key: 'products', header: 'Products', hideOnMobile: true, cell: (c) => c.productCount },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <span className="flex items-center gap-1">
          <StatusBadge status={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
          {c.isFeatured ? (
            <Star className="size-4 fill-accent text-accent" aria-label="Featured" />
          ) : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (c) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft({
                id: c.id,
                name: c.name,
                parentId: c.parentId ?? '',
                gstRateBps: c.gstRateBps,
                sortOrder: String(c.sortOrder),
                isActive: c.isActive,
                isFeatured: c.isFeatured,
              });
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={c.productCount > 0}
            title={c.productCount > 0 ? 'Move its products first' : undefined}
            onClick={() => {
              setDeleting({ kind: 'category', id: c.id, name: c.name });
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];
  const brandColumns: Column<BrandSummary>[] = [
    { key: 'name', header: 'Brand', cell: (b) => <span className="font-medium">{b.name}</span> },
    { key: 'slug', header: 'Slug', hideOnMobile: true, cell: (b) => b.slug },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (b) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              toggleBrandFeatured.mutate(b);
            }}
          >
            {b.isFeatured ? 'Unfeature' : 'Feature'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setBrandDraft({ id: b.id, name: b.name });
            }}
          >
            Rename
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDeleting({ kind: 'brand', id: b.id, name: b.name });
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const submitCategory = (e: FormEvent) => {
    e.preventDefault();
    if (draft && draft.name.trim().length >= 2) saveCategory.mutate(draft);
  };
  return (
    <>
      <PageHeader
        title="Categories & brands"
        description="The category tree drives navigation, filters and the default GST rate."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyCategory);
            }}
          >
            <Plus aria-hidden="true" /> New category
          </Button>
        }
      />
      <DataTable
        caption="Categories"
        columns={catColumns}
        rows={rows}
        rowKey={(c) => c.id}
        isLoading={categories.isPending}
        error={categories.error}
      />
      <div className="mt-10 mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Brands</h2>
        <Button
          variant="outline"
          onClick={() => {
            setBrandDraft({ name: '' });
          }}
        >
          <Plus aria-hidden="true" /> New brand
        </Button>
      </div>
      <DataTable
        caption="Brands"
        columns={brandColumns}
        rows={brands.data}
        rowKey={(b) => b.id}
        isLoading={brands.isPending}
        error={brands.error}
      />

      <Sheet
        open={draft !== null}
        onOpenChange={(o) => {
          if (!o) setDraft(null);
        }}
      >
        <SheetContent side="center" title={draft?.id ? 'Edit category' : 'New category'}>
          {draft ? (
            <form className="space-y-4 p-4" onSubmit={submitCategory}>
              <div className="space-y-2">
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={draft.name}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value });
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cat-parent">Parent</Label>
                  <select
                    id="cat-parent"
                    className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
                    value={draft.parentId}
                    onChange={(e) => {
                      setDraft({ ...draft, parentId: e.target.value });
                    }}
                  >
                    <option value="">None (top level)</option>
                    {rows
                      ?.filter((c) => c.id !== draft.id && c.level < 2)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parentId ? `${byId.get(c.parentId)?.name ?? ''} › ` : ''}
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cat-gst">GST rate</Label>
                  <select
                    id="cat-gst"
                    className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
                    value={draft.gstRateBps}
                    onChange={(e) => {
                      setDraft({ ...draft, gstRateBps: Number(e.target.value) });
                    }}
                  >
                    {GST_RATES_BPS.map((r) => (
                      <option key={r} value={r}>
                        {r / 100}%
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cat-sort">Sort order</Label>
                  <Input
                    id="cat-sort"
                    inputMode="numeric"
                    value={draft.sortOrder}
                    onChange={(e) => {
                      setDraft({ ...draft, sortOrder: e.target.value.replace(/\D/g, '') });
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => {
                      setDraft({ ...draft, isActive: e.target.checked });
                    }}
                  />
                  Active
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.isFeatured}
                    onChange={(e) => {
                      setDraft({ ...draft, isFeatured: e.target.checked });
                    }}
                  />
                  Featured on home page
                </label>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={saveCategory.isPending}>
                  Save
                </Button>
              </div>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet
        open={brandDraft !== null}
        onOpenChange={(o) => {
          if (!o) setBrandDraft(null);
        }}
      >
        <SheetContent side="center" title={brandDraft?.id ? 'Rename brand' : 'New brand'}>
          {brandDraft ? (
            <form
              className="space-y-4 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (brandDraft.name.trim()) saveBrand.mutate(brandDraft);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="brand-name">Name</Label>
                <Input
                  id="brand-name"
                  required
                  maxLength={60}
                  value={brandDraft.name}
                  onChange={(e) => {
                    setBrandDraft({ ...brandDraft, name: e.target.value });
                  }}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={saveBrand.isPending}>
                  Save
                </Button>
              </div>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Delete ${deleting?.kind ?? ''} “${deleting?.name ?? ''}”?`}
        description="This cannot be undone. The API refuses if anything still references it."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </>
  );
}
