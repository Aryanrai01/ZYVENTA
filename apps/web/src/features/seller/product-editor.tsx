'use client';

import {
  GST_RATES_BPS,
  SELLER_SETTABLE_STATUSES,
  VARIANT_OPTION_KEYS,
  createProductSchema,
  updateProductSchema,
  type CategoryNode,
  type SellerProductDetail,
  type VariantOptionKey,
  type VariantOptions,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { StatusBadge } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/features/cart/use-cart';
import { ApiClientError } from '@/lib/api-client';
import { catalogService } from '@/services/catalog.service';
import { sellerService } from '@/services/seller.service';
import { ImageUploader, type EditableImage } from './image-uploader';

const AXIS_LABELS: Record<VariantOptionKey, string> = {
  color: 'Colour',
  size: 'Size',
  storage: 'Storage',
  ram: 'RAM',
  material: 'Material',
  model: 'Model',
};
const STATUS_LABELS = {
  DRAFT: 'Draft (hidden)',
  ACTIVE: 'Active (listed)',
  INACTIVE: 'Inactive (hidden)',
} as const;

interface VariantRow {
  id?: string;
  sku: string;
  options: VariantOptions;
  price: string;
  mrp: string;
  stock: string;
  isActive: boolean;
  dirty?: boolean;
}
interface Axis {
  name: VariantOptionKey;
  values: string;
}
interface Spec {
  group: string;
  name: string;
  value: string;
}

const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);
const toRupees = (paise: number) => (paise / 100).toString();
const splitList = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

function flatten(nodes: CategoryNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'— '.repeat(depth)}${n.name}` },
    ...flatten(n.children, depth + 1),
  ]);
}

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="font-semibold">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Create or edit a product with its images, specifications and variants. */
export function ProductEditor({ product }: { product?: SellerProductDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => catalogService.categories(),
  });
  const brands = useQuery({ queryKey: ['brands'], queryFn: () => catalogService.brands() });
  const categoryOptions = useMemo(() => flatten(categories.data ?? []), [categories.data]);

  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [brandId, setBrandId] = useState(product?.brandId ?? '');
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [highlights, setHighlights] = useState((product?.highlights ?? []).join('\n'));
  const [tags, setTags] = useState((product?.tags ?? []).join(', '));
  const [images, setImages] = useState<EditableImage[]>(
    product?.images.map((i) => ({
      url: i.url,
      alt: i.alt,
      ...(i.publicId ? { publicId: i.publicId } : {}),
      ...(i.width ? { width: i.width } : {}),
      ...(i.height ? { height: i.height } : {}),
    })) ?? [],
  );
  const [specs, setSpecs] = useState<Spec[]>(product?.specifications ?? []);
  const [gst, setGst] = useState<string>(
    product?.gstRateBps != null ? String(product.gstRateBps) : '',
  );
  const [hsn, setHsn] = useState(product?.hsnCode ?? '');
  const [returnable, setReturnable] = useState(product?.returnPolicy.returnable ?? true);
  const [returnDays, setReturnDays] = useState(String(product?.returnPolicy.windowDays ?? 7));
  const [warranty, setWarranty] = useState(product?.warranty ?? '');
  const [status, setStatus] = useState<(typeof SELLER_SETTABLE_STATUSES)[number]>(
    product && (SELLER_SETTABLE_STATUSES as readonly string[]).includes(product.status)
      ? (product.status as (typeof SELLER_SETTABLE_STATUSES)[number])
      : 'DRAFT',
  );
  const [axes, setAxes] = useState<Axis[]>(
    product?.variantOptions.map((o) => ({ name: o.name, values: o.values.join(', ') })) ?? [],
  );
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      options: v.options,
      price: toRupees(v.price),
      mrp: toRupees(v.mrp),
      stock: String(v.stock),
      isActive: v.isActive,
    })) ?? [{ sku: '', options: {}, price: '', mrp: '', stock: '0', isActive: true }],
  );
  const [errors, setErrors] = useState<string[]>([]);

  const axisValues = axes.map((a) => ({ name: a.name, values: splitList(a.values) }));

  const generate = () => {
    const combos = axisValues.reduce<VariantOptions[]>(
      (acc, axis) => acc.flatMap((combo) => axis.values.map((v) => ({ ...combo, [axis.name]: v }))),
      [{}],
    );
    const existing = new Map(variants.map((v) => [JSON.stringify(v.options), v]));
    setVariants(
      combos.map(
        (options) =>
          existing.get(JSON.stringify(options)) ?? {
            sku: '',
            options,
            price: variants[0]?.price ?? '',
            mrp: variants[0]?.mrp ?? '',
            stock: '0',
            isActive: true,
          },
      ),
    );
  };

  const common = () => ({
    name,
    categoryId,
    brandId: brandId || null,
    shortDescription,
    description,
    highlights: highlights
      .split('\n')
      .map((h) => h.trim())
      .filter(Boolean),
    specifications: specs
      .filter((s) => s.name && s.value)
      .map((s) => ({ group: s.group || 'General', name: s.name, value: s.value })),
    tags: splitList(tags.toLowerCase()),
    images: images.map((i) => ({
      url: i.url,
      ...(i.publicId ? { publicId: i.publicId } : {}),
      ...(i.alt ? { alt: i.alt } : {}),
      ...(i.width ? { width: i.width } : {}),
      ...(i.height ? { height: i.height } : {}),
    })),
    hsnCode: hsn || null,
    gstRateBps: gst ? Number(gst) : null,
    returnPolicy: { returnable, windowDays: returnable ? Number(returnDays) : 0 },
    warranty,
    status,
  });

  const variantPayload = (v: VariantRow) => ({
    sku: v.sku.toUpperCase(),
    options: v.options,
    price: toPaise(v.price),
    mrp: toPaise(v.mrp),
    stock: Number(v.stock) || 0,
    images: [],
    isActive: v.isActive,
  });

  const save = useMutation({
    mutationFn: async () => {
      setErrors([]);
      if (!product) {
        const input = {
          ...common(),
          variantOptions: axisValues.filter((a) => a.values.length > 0),
          variants: variants.map(variantPayload),
        };
        const parsed = createProductSchema.safeParse(input);
        if (!parsed.success)
          throw new ValidationProblem(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
          );
        return sellerService.createProduct(parsed.data);
      }
      const parsed = updateProductSchema.safeParse(common());
      if (!parsed.success)
        throw new ValidationProblem(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        );
      let saved = await sellerService.updateProduct(product.id, parsed.data);
      for (const v of variants) {
        if (!v.id) saved = await sellerService.addVariant(product.id, variantPayload(v));
        else if (v.dirty) {
          saved = await sellerService.updateVariant(product.id, v.id, {
            sku: v.sku.toUpperCase(),
            price: toPaise(v.price),
            mrp: toPaise(v.mrp),
            isActive: v.isActive,
          });
        }
      }
      return saved;
    },
    onSuccess: (saved) => {
      toast.success(product ? 'Product saved' : 'Product created');
      void queryClient.invalidateQueries({ queryKey: ['seller'] });
      if (!product) router.replace(`/seller/products/${saved.id}` as Route);
      else queryClient.setQueryData(['seller', 'product', saved.id], saved);
    },
    onError: (e) => {
      if (e instanceof ValidationProblem) setErrors(e.problems);
      else if (e instanceof ApiClientError && e.errors.length > 0)
        setErrors(e.errors.map((x) => `${x.path.replace(/^body\./, '')}: ${x.message}`));
      else setErrors([errorMessage(e)]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  const updateVariant = (index: number, patch: Partial<VariantRow>) => {
    setVariants((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch, dirty: true } : r)));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      noValidate
    >
      <PageHeader
        title={product ? product.name : 'New product'}
        description={
          product ? (
            <span className="inline-flex items-center gap-2">
              Status: <StatusBadge status={product.status} />
              {product.statusReason ? ` — ${product.statusReason}` : ''}
            </span>
          ) : (
            'Fill in the details, add variants and publish.'
          )
        }
        actions={
          <>
            {product?.status === 'ACTIVE' ? (
              <Button asChild variant="outline">
                <Link href={`/products/${product.slug}` as Route} target="_blank">
                  View on store
                </Link>
              </Button>
            ) : null}
            <Button type="submit" loading={save.isPending}>
              {product ? 'Save changes' : 'Create product'}
            </Button>
          </>
        }
      />
      {product?.status === 'BLOCKED' ? (
        <Alert variant="error" title="This product was blocked by our team" className="mb-4">
          {product.statusReason}
        </Alert>
      ) : null}
      {errors.length > 0 ? (
        <Alert variant="error" title="Please fix the following" className="mb-4">
          <ul className="list-disc pl-4">
            {errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Section title="Basics">
            <Field label="Product name" htmlFor="p-name">
              <Input
                id="p-name"
                value={name}
                maxLength={200}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="p-cat">
                <select
                  id="p-cat"
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                  }}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Choose a category</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Brand" htmlFor="p-brand">
                <select
                  id="p-brand"
                  value={brandId}
                  onChange={(e) => {
                    setBrandId(e.target.value);
                  }}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">No brand</option>
                  {(brands.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label="Short description"
              htmlFor="p-short"
              hint="One or two lines shown near the price."
            >
              <Textarea
                id="p-short"
                className="min-h-16"
                maxLength={300}
                value={shortDescription}
                onChange={(e) => {
                  setShortDescription(e.target.value);
                }}
              />
            </Field>
            <Field label="Highlights" htmlFor="p-high" hint="One per line, up to 10.">
              <Textarea
                id="p-high"
                value={highlights}
                onChange={(e) => {
                  setHighlights(e.target.value);
                }}
              />
            </Field>
            <Field
              label="Full description"
              htmlFor="p-desc"
              hint="Basic HTML (paragraphs, lists, bold) is allowed; scripts and styles are removed."
            >
              <Textarea
                id="p-desc"
                className="min-h-40 font-mono text-xs"
                maxLength={20000}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
              />
            </Field>
          </Section>

          <Section title="Images">
            <ImageUploader images={images} onChange={setImages} />
          </Section>

          <Section
            title="Variants"
            description="Up to 3 option types (e.g. colour and size). Leave empty for a single-variant product."
          >
            {!product ? (
              <>
                {axes.map((axis, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <Field label="Option" htmlFor={`axis-${String(i)}`}>
                      <select
                        id={`axis-${String(i)}`}
                        value={axis.name}
                        onChange={(e) => {
                          setAxes((a) =>
                            a.map((x, j) =>
                              j === i ? { ...x, name: e.target.value as VariantOptionKey } : x,
                            ),
                          );
                        }}
                        className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                      >
                        {VARIANT_OPTION_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {AXIS_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="min-w-48 flex-1">
                      <Field label="Values (comma separated)" htmlFor={`axis-v-${String(i)}`}>
                        <Input
                          id={`axis-v-${String(i)}`}
                          value={axis.values}
                          placeholder="Black, Blue"
                          onChange={(e) => {
                            setAxes((a) =>
                              a.map((x, j) => (j === i ? { ...x, values: e.target.value } : x)),
                            );
                          }}
                        />
                      </Field>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove option"
                      onClick={() => {
                        setAxes((a) => a.filter((_, j) => j !== i));
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {axes.length < 3 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAxes((a) => [
                          ...a,
                          {
                            name:
                              VARIANT_OPTION_KEYS.find((k) => !a.some((x) => x.name === k)) ??
                              'color',
                            values: '',
                          },
                        ]);
                      }}
                    >
                      <Plus aria-hidden="true" /> Add option
                    </Button>
                  ) : null}
                  {axes.length > 0 ? (
                    <Button type="button" variant="outline" size="sm" onClick={generate}>
                      <Wand2 aria-hidden="true" /> Generate variants
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Options:{' '}
                {product.variantOptions
                  .map((o) => `${AXIS_LABELS[o.name]} (${o.values.join(', ')})`)
                  .join(' · ') || 'none'}
                . Stock is managed in{' '}
                <Link href="/seller/inventory" className="underline">
                  Inventory
                </Link>
                .
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2 pr-2">Variant</th>
                    <th className="py-2 pr-2">SKU</th>
                    <th className="py-2 pr-2">Price ₹</th>
                    <th className="py-2 pr-2">MRP ₹</th>
                    <th className="py-2 pr-2">{product ? 'Stock' : 'Opening stock'}</th>
                    <th className="py-2">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, i) => (
                    <tr key={v.id ?? `new-${String(i)}`} className="border-t">
                      <td className="py-2 pr-2">
                        {product && !v.id && product.variantOptions.length > 0 ? (
                          <div className="flex gap-1">
                            {product.variantOptions.map((o) => (
                              <select
                                key={o.name}
                                aria-label={AXIS_LABELS[o.name]}
                                value={v.options[o.name] ?? ''}
                                onChange={(e) => {
                                  updateVariant(i, {
                                    options: { ...v.options, [o.name]: e.target.value },
                                  });
                                }}
                                className="h-9 rounded-md border border-input bg-card px-2"
                              >
                                <option value="">{AXIS_LABELS[o.name]}</option>
                                {o.values.map((val) => (
                                  <option key={val}>{val}</option>
                                ))}
                              </select>
                            ))}
                          </div>
                        ) : (
                          Object.values(v.options).join(' / ') || 'Default'
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label="SKU"
                          className="h-9 uppercase"
                          value={v.sku}
                          onChange={(e) => {
                            updateVariant(i, { sku: e.target.value });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label="Price in rupees"
                          className="h-9 w-28"
                          inputMode="decimal"
                          value={v.price}
                          onChange={(e) => {
                            updateVariant(i, { price: e.target.value.replace(/[^\d.]/g, '') });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label="MRP in rupees"
                          className="h-9 w-28"
                          inputMode="decimal"
                          value={v.mrp}
                          onChange={(e) => {
                            updateVariant(i, { mrp: e.target.value.replace(/[^\d.]/g, '') });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label="Stock"
                          className="h-9 w-24"
                          inputMode="numeric"
                          value={v.stock}
                          disabled={Boolean(v.id)}
                          onChange={(e) => {
                            updateVariant(i, { stock: e.target.value.replace(/\D/g, '') });
                          }}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="checkbox"
                          aria-label="Variant active"
                          className="size-4 accent-primary"
                          checked={v.isActive}
                          onChange={(e) => {
                            updateVariant(i, { isActive: e.target.checked });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {product && product.variantOptions.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setVariants((rows) => [
                    ...rows,
                    {
                      sku: '',
                      options: {},
                      price: rows[0]?.price ?? '',
                      mrp: rows[0]?.mrp ?? '',
                      stock: '0',
                      isActive: true,
                      dirty: true,
                    },
                  ]);
                }}
              >
                <Plus aria-hidden="true" /> Add variant
              </Button>
            ) : null}
          </Section>

          <Section title="Specifications">
            {specs.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-2">
                <Input
                  aria-label="Group"
                  placeholder="Group"
                  value={s.group}
                  onChange={(e) => {
                    setSpecs((x) =>
                      x.map((y, j) => (j === i ? { ...y, group: e.target.value } : y)),
                    );
                  }}
                />
                <Input
                  aria-label="Name"
                  placeholder="Name"
                  value={s.name}
                  onChange={(e) => {
                    setSpecs((x) =>
                      x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)),
                    );
                  }}
                />
                <Input
                  aria-label="Value"
                  placeholder="Value"
                  value={s.value}
                  onChange={(e) => {
                    setSpecs((x) =>
                      x.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)),
                    );
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove specification"
                  onClick={() => {
                    setSpecs((x) => x.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSpecs((x) => [...x, { group: 'General', name: '', value: '' }]);
              }}
            >
              <Plus aria-hidden="true" /> Add specification
            </Button>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Visibility">
            <Field label="Status" htmlFor="p-status">
              <select
                id="p-status"
                value={status}
                disabled={product?.status === 'BLOCKED'}
                onChange={(e) => {
                  setStatus(e.target.value as typeof status);
                }}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                {SELLER_SETTABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </Section>
          <Section title="Tax">
            <Field label="GST rate" htmlFor="p-gst" hint="Leave as category default if unsure.">
              <select
                id="p-gst"
                value={gst}
                onChange={(e) => {
                  setGst(e.target.value);
                }}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Category default</option>
                {GST_RATES_BPS.map((r) => (
                  <option key={r} value={r}>
                    {r / 100}%
                  </option>
                ))}
              </select>
            </Field>
            <Field label="HSN code" htmlFor="p-hsn">
              <Input
                id="p-hsn"
                inputMode="numeric"
                maxLength={8}
                value={hsn}
                onChange={(e) => {
                  setHsn(e.target.value.replace(/\D/g, ''));
                }}
              />
            </Field>
          </Section>
          <Section title="Returns & warranty">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={returnable}
                onChange={(e) => {
                  setReturnable(e.target.checked);
                }}
              />{' '}
              Returnable
            </label>
            {returnable ? (
              <Field label="Return window (days)" htmlFor="p-days">
                <Input
                  id="p-days"
                  inputMode="numeric"
                  value={returnDays}
                  onChange={(e) => {
                    setReturnDays(e.target.value.replace(/\D/g, '').slice(0, 2));
                  }}
                />
              </Field>
            ) : null}
            <Field label="Warranty" htmlFor="p-warranty">
              <Input
                id="p-warranty"
                maxLength={200}
                value={warranty}
                placeholder="e.g. 1 year manufacturer warranty"
                onChange={(e) => {
                  setWarranty(e.target.value);
                }}
              />
            </Field>
          </Section>
          <Section title="Search tags">
            <Field label="Tags" htmlFor="p-tags" hint="Comma separated, up to 20.">
              <Input
                id="p-tags"
                value={tags}
                onChange={(e) => {
                  setTags(e.target.value);
                }}
              />
            </Field>
          </Section>
        </div>
      </div>
    </form>
  );
}

class ValidationProblem extends Error {
  constructor(readonly problems: string[]) {
    super('Validation failed');
  }
}
