'use client';

import {
  CART_MAX_QUANTITY_PER_LINE,
  type ProductDetail,
  type VariantOptionKey,
} from '@zyventa/shared';
import { BadgeCheck, RotateCcw, ShieldCheck, ShoppingCart, Store, Zap } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Price } from '@/components/catalog/price';
import { QuantityStepper } from '@/components/catalog/quantity-stepper';
import { Rating } from '@/components/catalog/rating';
import { WishlistButton } from '@/components/catalog/wishlist-button';
import { toast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { useCartActions } from '@/features/cart/use-cart';
import { cn } from '@/lib/utils';
import { NotifyMe } from './notify-me';
import { ProductGallery } from './product-gallery';
import { initialVariant, selectValue, valueState } from './variant-selection';

const AXIS_LABELS: Record<VariantOptionKey, string> = {
  color: 'Colour',
  size: 'Size',
  storage: 'Storage',
  ram: 'RAM',
  material: 'Material',
  model: 'Model',
};

/** Gallery + purchase panel sharing the selected variant (kept in `?variant=` for sharing). */
export function ProductExperience({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { add } = useCartActions();

  const [variantId, setVariantId] = useState(
    () => initialVariant(product.variants, searchParams.get('variant'))?.id,
  );
  const variant = product.variants.find((v) => v.id === variantId);
  const [quantity, setQuantity] = useState(1);
  const [intent, setIntent] = useState<'add' | 'buy' | null>(null);

  const images = useMemo(
    () => (variant && variant.images.length > 0 ? variant.images : product.images),
    [variant, product.images],
  );
  const maxQuantity = variant ? Math.min(variant.maxQuantity, CART_MAX_QUANTITY_PER_LINE) : 0;
  const purchasable = Boolean(variant?.inStock) && maxQuantity > 0;

  const choose = (axis: VariantOptionKey, value: string) => {
    const next = selectValue(product.variants, variant, axis, value);
    if (!next || next.id === variant?.id) return;
    setVariantId(next.id);
    setQuantity(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set('variant', next.id);
    router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false });
  };

  const addToCart = (mode: 'add' | 'buy') => {
    if (!variant || !purchasable) return;
    setIntent(mode);
    add.mutate(
      { variantId: variant.id, quantity, maxQuantity },
      {
        onSuccess: () => {
          if (mode === 'buy') router.push('/cart');
          else toast.success(`Added ${product.name} to your cart`);
        },
        onSettled: () => {
          setIntent(null);
        },
      },
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
      <ProductGallery images={images} name={product.name} />

      <div className="min-w-0">
        {product.brand ? (
          <Link
            href={`/products?brand=${product.brand.slug}` as Route}
            className="text-sm font-medium text-primary hover:underline"
          >
            {product.brand.name}
          </Link>
        ) : null}
        <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl">
          {product.name}
        </h1>
        <Rating value={product.ratingAvg} count={product.ratingCount} className="mt-2" />

        <div className="mt-4 border-t pt-4">
          {variant ? (
            <Price
              price={variant.price}
              mrp={variant.mrp}
              discountPercent={variant.discountPercent}
              size="lg"
            />
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">Inclusive of all taxes</p>
          <StockStatus inStock={Boolean(variant?.inStock)} lowStock={Boolean(variant?.lowStock)} />
        </div>

        {product.variantOptions.map((axis) => (
          <fieldset key={axis.name} className="mt-5">
            <legend className="text-sm font-medium">
              {AXIS_LABELS[axis.name]}:{' '}
              <span className="font-normal text-muted-foreground">
                {variant?.options[axis.name] ?? 'Choose'}
              </span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {axis.values.map((value) => {
                const state = valueState(product.variants, variant, axis.name, value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={state === 'selected'}
                    onClick={() => {
                      choose(axis.name, value);
                    }}
                    className={cn(
                      'min-h-10 rounded-md border px-3.5 text-sm transition-colors',
                      state === 'selected' &&
                        'border-primary bg-primary-soft font-medium text-primary ring-1 ring-primary',
                      state === 'available' && 'hover:border-foreground',
                      state === 'out-of-stock' && 'text-muted-foreground line-through',
                      state === 'unavailable' && 'border-dashed text-muted-foreground',
                    )}
                  >
                    {value}
                    {state === 'out-of-stock' ? (
                      <span className="sr-only"> (out of stock)</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {purchasable ? (
          <div className="mt-6 flex items-center gap-3">
            <span className="text-sm font-medium">Quantity</span>
            <QuantityStepper value={quantity} max={maxQuantity} onChange={setQuantity} />
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          {!purchasable && variant ? (
            <NotifyMe variantId={variant.id} />
          ) : (
            <>
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                disabled={!purchasable || add.isPending}
                loading={intent === 'add'}
                onClick={() => {
                  addToCart('add');
                }}
              >
                <ShoppingCart aria-hidden="true" /> Add to cart
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={!purchasable || add.isPending}
                loading={intent === 'buy'}
                onClick={() => {
                  addToCart('buy');
                }}
              >
                <Zap aria-hidden="true" /> Buy now
              </Button>
            </>
          )}
          <WishlistButton productId={product.id} productName={product.name} variant="outline" />
        </div>

        {product.shortDescription ? (
          <p className="mt-6 text-sm text-pretty text-muted-foreground">
            {product.shortDescription}
          </p>
        ) : null}

        <ul className="mt-6 space-y-3 rounded-xl border bg-card p-4 text-sm">
          <li className="flex gap-3">
            <Store className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Sold by <span className="font-medium">{product.seller.storeName}</span>
              {product.seller.ratingCount > 0 ? (
                <span className="text-muted-foreground">
                  {' '}
                  · {product.seller.ratingAvg.toFixed(1)}★ seller rating
                </span>
              ) : null}
            </span>
          </li>
          <li className="flex gap-3">
            <RotateCcw className="size-5 shrink-0 text-primary" aria-hidden="true" />
            {product.returnPolicy.returnable && product.returnPolicy.windowDays > 0
              ? `${String(product.returnPolicy.windowDays)}-day easy returns`
              : 'Not returnable'}
          </li>
          {product.warranty ? (
            <li className="flex gap-3">
              <BadgeCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
              {product.warranty}
            </li>
          ) : null}
          <li className="flex gap-3">
            <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
            Secure payments · GST invoice available
          </li>
        </ul>
      </div>
    </div>
  );
}

function StockStatus({ inStock, lowStock }: { inStock: boolean; lowStock: boolean }) {
  if (!inStock) {
    return <p className="mt-3 text-sm font-semibold text-destructive">Currently out of stock</p>;
  }
  if (lowStock) {
    return (
      <p className="mt-3 text-sm font-semibold text-warning-foreground">Hurry — only a few left</p>
    );
  }
  return <p className="mt-3 text-sm font-semibold text-success">In stock</p>;
}
