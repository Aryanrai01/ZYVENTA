'use client';

import {
  couponInputSchema,
  describeDiscount,
  offerInputSchema,
  type COUPON_VISIBILITIES,
  type CouponInput,
  type CouponView,
  type OfferInput,
  type OfferView,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { errorMessage } from '@/features/cart/use-cart';
import type { ApiResult } from '@/lib/api-client';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

type Status = 'active' | 'scheduled' | 'expired' | 'disabled';
const STATUS_OPTIONS = [
  { value: 'active' as const, label: 'Active' },
  { value: 'scheduled' as const, label: 'Scheduled' },
  { value: 'expired' as const, label: 'Expired' },
  { value: 'disabled' as const, label: 'Disabled' },
];
const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function lifecycle(p: { isActive: boolean; startsAt: string; endsAt: string }): string {
  const now = Date.now();
  if (!p.isActive) return 'INACTIVE';
  if (new Date(p.endsAt).getTime() <= now) return 'EXPIRED';
  if (new Date(p.startsAt).getTime() > now) return 'PENDING';
  return 'ACTIVE';
}
const LIFECYCLE_LABEL: Record<string, string> = {
  INACTIVE: 'Disabled',
  EXPIRED: 'Expired',
  PENDING: 'Scheduled',
  ACTIVE: 'Active',
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export interface PromotionApi {
  coupons: (q: { status?: string; page: number }) => Promise<ApiResult<CouponView[]>>;
  createCoupon: (input: CouponInput) => Promise<unknown>;
  updateCoupon: (id: string, input: { isActive: boolean }) => Promise<unknown>;
  offers: (q: { status?: string; page: number }) => Promise<ApiResult<OfferView[]>>;
  createOffer: (input: OfferInput) => Promise<unknown>;
  updateOffer: (id: string, input: { isActive: boolean }) => Promise<unknown>;
}

/** Offers (automatic) and coupons (code) for either a seller (own catalogue) or the platform. */
export function PromotionManager({ api, scopeNote }: { api: PromotionApi; scopeNote: string }) {
  const [tab, setTab] = useState<'offers' | 'coupons'>('offers');
  return (
    <div>
      <div
        role="tablist"
        aria-label="Promotion type"
        className="mb-4 inline-flex rounded-md border bg-card p-0.5"
      >
        {(['offers', 'coupons'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
            }}
            className={cn(
              'rounded px-4 py-1.5 text-sm capitalize',
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {t === 'offers' ? 'Automatic offers' : 'Coupon codes'}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{scopeNote}</p>
      {tab === 'offers' ? <OfferTable api={api} /> : <CouponTable api={api} />}
    </div>
  );
}

function DiscountFields({
  type,
  setType,
  value,
  setValue,
  maxDiscount,
  setMaxDiscount,
  startsAt,
  setStartsAt,
  endsAt,
  setEndsAt,
}: {
  type: 'PERCENTAGE' | 'FIXED';
  setType: (t: 'PERCENTAGE' | 'FIXED') => void;
  value: string;
  setValue: (v: string) => void;
  maxDiscount: string;
  setMaxDiscount: (v: string) => void;
  startsAt: string;
  setStartsAt: (v: string) => void;
  endsAt: string;
  setEndsAt: (v: string) => void;
}) {
  return (
    <>
      <fieldset>
        <legend className="text-sm font-medium">Discount type</legend>
        <div className="mt-2 flex gap-2">
          {(['PERCENTAGE', 'FIXED'] as const).map((t) => (
            <label
              key={t}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
            >
              <input
                type="radio"
                name="dtype"
                className="accent-primary"
                checked={type === t}
                onChange={() => {
                  setType(t);
                }}
              />
              {t === 'PERCENTAGE' ? 'Percentage' : 'Fixed amount'}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="d-value">
            {type === 'PERCENTAGE' ? 'Percent off (1–90)' : 'Amount off (₹)'}
          </Label>
          <Input
            id="d-value"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(/[^\d.]/g, ''));
            }}
          />
        </div>
        {type === 'PERCENTAGE' ? (
          <div className="space-y-2">
            <Label htmlFor="d-max">Max discount ₹ (optional)</Label>
            <Input
              id="d-max"
              inputMode="decimal"
              value={maxDiscount}
              onChange={(e) => {
                setMaxDiscount(e.target.value.replace(/[^\d.]/g, ''));
              }}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="d-start">Starts</Label>
          <Input
            id="d-start"
            type="date"
            value={startsAt}
            onChange={(e) => {
              setStartsAt(e.target.value);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="d-end">Ends</Label>
          <Input
            id="d-end"
            type="date"
            value={endsAt}
            onChange={(e) => {
              setEndsAt(e.target.value);
            }}
          />
        </div>
      </div>
    </>
  );
}

function useDiscountState() {
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [value, setValue] = useState('10');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [startsAt, setStartsAt] = useState(today());
  const [endsAt, setEndsAt] = useState(inDays(30));
  const payload = () => ({
    type,
    value: type === 'PERCENTAGE' ? Math.round(Number(value)) : Math.round(Number(value) * 100),
    maxDiscount:
      type === 'PERCENTAGE' && maxDiscount ? Math.round(Number(maxDiscount) * 100) : null,
    startsAt: new Date(`${startsAt}T00:00:00`),
    endsAt: new Date(`${endsAt}T23:59:59`),
    isActive: true,
  });
  return {
    fields: {
      type,
      setType,
      value,
      setValue,
      maxDiscount,
      setMaxDiscount,
      startsAt,
      setStartsAt,
      endsAt,
      setEndsAt,
    },
    payload,
  };
}

function Problems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <Alert variant="error">
      <ul className="list-disc pl-4">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </Alert>
  );
}

function OfferTable({ api }: { api: PromotionApi }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status | ''>('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('0');
  const [problems, setProblems] = useState<string[]>([]);
  const discount = useDiscountState();
  const query = useQuery({
    queryKey: ['promotions', 'offers', status, page, api],
    queryFn: () => api.offers({ page, ...(status ? { status } : {}) }),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['promotions', 'offers'] });
  const create = useMutation({
    mutationFn: async () => {
      const parsed = offerInputSchema.safeParse({
        title,
        priority: Number(priority) || 0,
        ...discount.payload(),
      });
      if (!parsed.success) throw new Problem(parsed.error.issues.map((i) => i.message));
      return api.createOffer(parsed.data);
    },
    onSuccess: () => {
      toast.success('Offer created');
      setOpen(false);
      setTitle('');
      refresh();
    },
    onError: (e) => {
      setProblems(e instanceof Problem ? e.problems : [errorMessage(e)]);
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateOffer(id, { isActive }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns: Column<OfferView>[] = [
    { key: 'title', header: 'Offer', cell: (o) => <span className="font-medium">{o.title}</span> },
    {
      key: 'discount',
      header: 'Discount',
      cell: (o) => describeDiscount(o.type, o.value, formatPrice, o.maxDiscount),
    },
    {
      key: 'dates',
      header: 'Runs',
      hideOnMobile: true,
      cell: (o) =>
        `${dateFmt.format(new Date(o.startsAt))} – ${dateFmt.format(new Date(o.endsAt))}`,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (o) => {
        const s = lifecycle(o);
        return <StatusBadge status={s} label={LIFECYCLE_LABEL[s]} />;
      },
    },
    {
      key: 'action',
      header: <span className="sr-only">Actions</span>,
      cell: (o) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            toggle.mutate({ id: o.id, isActive: !o.isActive });
          }}
        >
          {o.isActive ? 'Disable' : 'Enable'}
        </Button>
      ),
    },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <Button
          onClick={() => {
            setProblems([]);
            setOpen(true);
          }}
        >
          <Plus aria-hidden="true" /> New offer
        </Button>
      </div>
      <DataTable
        caption="Offers"
        columns={columns}
        rows={query.data?.data}
        rowKey={(o) => o.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No offers"
        emptyDescription="Offers lower prices automatically — no code needed."
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" title="New automatic offer">
          <form
            className="space-y-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              setProblems([]);
              create.mutate();
            }}
          >
            <Problems problems={problems} />
            <div className="space-y-2">
              <Label htmlFor="o-title">Title (shown to shoppers)</Label>
              <Input
                id="o-title"
                maxLength={80}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                placeholder="Festive sale"
              />
            </div>
            <DiscountFields {...discount.fields} />
            <div className="space-y-2">
              <Label htmlFor="o-priority">Priority (0–100, breaks ties)</Label>
              <Input
                id="o-priority"
                inputMode="numeric"
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value.replace(/\D/g, '').slice(0, 3));
                }}
              />
            </div>
            <Button type="submit" fullWidth loading={create.isPending}>
              Create offer
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

function CouponTable({ api }: { api: PromotionApi }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status | ''>('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [perUser, setPerUser] = useState('1');
  const [firstOrder, setFirstOrder] = useState(false);
  const [visibility, setVisibility] = useState<(typeof COUPON_VISIBILITIES)[number]>('PUBLIC');
  const [problems, setProblems] = useState<string[]>([]);
  const discount = useDiscountState();
  const query = useQuery({
    queryKey: ['promotions', 'coupons', status, page, api],
    queryFn: () => api.coupons({ page, ...(status ? { status } : {}) }),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['promotions', 'coupons'] });
  const create = useMutation({
    mutationFn: async () => {
      const parsed = couponInputSchema.safeParse({
        code,
        title,
        ...discount.payload(),
        minOrderAmount: minOrder ? Math.round(Number(minOrder) * 100) : 0,
        usageLimit: usageLimit ? Number(usageLimit) : null,
        perUserLimit: Number(perUser) || 1,
        firstOrderOnly: firstOrder,
        visibility,
      });
      if (!parsed.success)
        throw new Problem(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
      return api.createCoupon(parsed.data);
    },
    onSuccess: () => {
      toast.success('Coupon created');
      setOpen(false);
      setCode('');
      setTitle('');
      refresh();
    },
    onError: (e) => {
      setProblems(e instanceof Problem ? e.problems : [errorMessage(e)]);
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateCoupon(id, { isActive }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns: Column<CouponView>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (c) => (
        <span>
          <span className="font-mono font-semibold">{c.code}</span>
          <span className="block text-xs text-muted-foreground">{c.title}</span>
        </span>
      ),
    },
    {
      key: 'discount',
      header: 'Discount',
      cell: (c) => (
        <span>
          {describeDiscount(c.type, c.value, formatPrice, c.maxDiscount)}
          {c.minOrderAmount ? (
            <span className="block text-xs text-muted-foreground">
              Min {formatPrice(c.minOrderAmount)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Used',
      hideOnMobile: true,
      cell: (c) => `${String(c.usedCount)}${c.usageLimit ? ` / ${String(c.usageLimit)}` : ''}`,
    },
    {
      key: 'dates',
      header: 'Valid',
      hideOnMobile: true,
      cell: (c) =>
        `${dateFmt.format(new Date(c.startsAt))} – ${dateFmt.format(new Date(c.endsAt))}`,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => {
        const s = lifecycle(c);
        return <StatusBadge status={s} label={LIFECYCLE_LABEL[s]} />;
      },
    },
    {
      key: 'action',
      header: <span className="sr-only">Actions</span>,
      cell: (c) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            toggle.mutate({ id: c.id, isActive: !c.isActive });
          }}
        >
          {c.isActive ? 'Disable' : 'Enable'}
        </Button>
      ),
    },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <Button
          onClick={() => {
            setProblems([]);
            setOpen(true);
          }}
        >
          <Plus aria-hidden="true" /> New coupon
        </Button>
      </div>
      <DataTable
        caption="Coupons"
        columns={columns}
        rows={query.data?.data}
        rowKey={(c) => c.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No coupons"
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" title="New coupon">
          <form
            className="space-y-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              setProblems([]);
              create.mutate();
            }}
          >
            <Problems problems={problems} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="c-code">Code</Label>
                <Input
                  id="c-code"
                  className="font-mono uppercase"
                  maxLength={20}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase());
                  }}
                  placeholder="SAVE10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-title">Title</Label>
                <Input
                  id="c-title"
                  maxLength={80}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                  }}
                />
              </div>
            </div>
            <DiscountFields {...discount.fields} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="c-min">Min order ₹</Label>
                <Input
                  id="c-min"
                  inputMode="decimal"
                  value={minOrder}
                  onChange={(e) => {
                    setMinOrder(e.target.value.replace(/[^\d.]/g, ''));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-limit">Total uses</Label>
                <Input
                  id="c-limit"
                  inputMode="numeric"
                  placeholder="Unlimited"
                  value={usageLimit}
                  onChange={(e) => {
                    setUsageLimit(e.target.value.replace(/\D/g, ''));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-per">Per customer</Label>
                <Input
                  id="c-per"
                  inputMode="numeric"
                  value={perUser}
                  onChange={(e) => {
                    setPerUser(e.target.value.replace(/\D/g, '').slice(0, 3));
                  }}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={firstOrder}
                onChange={(e) => {
                  setFirstOrder(e.target.checked);
                }}
              />{' '}
              First order only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={visibility === 'PUBLIC'}
                onChange={(e) => {
                  setVisibility(e.target.checked ? 'PUBLIC' : 'PRIVATE');
                }}
              />{' '}
              Show in “Available coupons” at checkout
            </label>
            <Button type="submit" fullWidth loading={create.isPending}>
              Create coupon
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

class Problem extends Error {
  constructor(readonly problems: string[]) {
    super('Invalid');
  }
}
