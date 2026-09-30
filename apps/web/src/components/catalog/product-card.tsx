import type { ProductCard as ProductCardData } from '@zyventa/shared';
import Link from 'next/link';
import type { Route } from 'next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Price } from './price';
import { ProductImage } from './product-image';
import { Rating } from './rating';
import { WishlistButton } from './wishlist-button';

export const productHref = (slug: string) => `/products/${slug}` as Route;

export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductCardData;
  priority?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-card transition-shadow hover:shadow-raised',
        className,
      )}
    >
      <div className="relative">
        <ProductImage
          image={product.image}
          alt={product.name}
          sizes="(min-width: 1280px) 240px, (min-width: 768px) 30vw, 50vw"
          priority={priority}
          className={cn(!product.inStock && 'opacity-60')}
        />
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {!product.inStock ? <Badge variant="neutral">Out of stock</Badge> : null}
          {product.inStock && product.discountPercent >= 40 ? (
            <Badge variant="accent">Deal</Badge>
          ) : null}
        </div>
        <WishlistButton
          productId={product.id}
          productName={product.name}
          className="absolute top-2 right-2 z-10"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.brandName ? (
          <p className="truncate text-xs font-medium text-muted-foreground uppercase">
            {product.brandName}
          </p>
        ) : null}
        <h3 className="line-clamp-2 text-sm leading-snug font-medium">
          <Link
            href={productHref(product.slug)}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {product.name}
          </Link>
        </h3>
        <Rating value={product.ratingAvg} count={product.ratingCount} />
        <Price
          price={product.price}
          mrp={product.mrp}
          discountPercent={product.discountPercent}
          fromPrefix={product.hasPriceRange}
          size="sm"
          className="mt-auto pt-1"
        />
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  priorityCount = 0,
}: {
  products: ProductCardData[];
  priorityCount?: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

/** Horizontally scrolling row (snap) for homepage shelves and "related" sections. */
export function ProductRail({ products }: { products: ProductCardData[] }) {
  return (
    <ul className="-mx-4 scrollbar-none flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
      {products.map((product) => (
        <li key={product.id} className="w-40 shrink-0 snap-start sm:w-48 lg:w-52">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-hidden="true">
      <div className="aspect-square animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
