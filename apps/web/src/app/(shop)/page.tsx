import type { BrandSummary, CategoryNode, ProductCard } from '@zyventa/shared';
import { ArrowRight, BadgePercent, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { ProductGrid, ProductRail } from '@/components/catalog/product-card';
import { Button } from '@/components/ui/button';
import { HomeSection } from '@/features/home/section';
import { RecentlyViewedRail } from '@/features/recently-viewed/recently-viewed-rail';
import { RecommendedRail } from '@/features/recently-viewed/recommended-rail';
import { catalogService, type ProductFilters } from '@/services/catalog.service';

const CACHE = { next: { revalidate: 60, tags: ['products'] } };

async function safe<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback; // one failing shelf must not take down the homepage
  }
}

const shelf = (filters: ProductFilters) =>
  safe(async () => (await catalogService.products(filters, CACHE)).data, [] as ProductCard[]);

export default async function HomePage() {
  const [categories, brands, deals, trending, featured, newest] = await Promise.all([
    safe(() => catalogService.categories({ next: { revalidate: 300 } }), [] as CategoryNode[]),
    safe(() => catalogService.brands({ next: { revalidate: 300 } }), [] as BrandSummary[]),
    shelf({ sort: 'discount', discount: 20, inStock: true, limit: 12 }),
    shelf({ sort: 'popular', inStock: true, limit: 12 }),
    shelf({ featured: true, sort: 'rating', limit: 8 }),
    shelf({ sort: 'newest', limit: 12 }),
  ]);
  const topBrands = brands.filter((b) => b.isFeatured).slice(0, 12);

  return (
    <>
      <Hero />

      {categories.length > 0 ? (
        <HomeSection id="shop-by-category" title="Shop by category" href="/categories">
          <ul className="grid grid-cols-4 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.slug}` as Route}
                  className="group flex flex-col items-center gap-2 text-center"
                >
                  <span className="relative aspect-square w-full overflow-hidden rounded-2xl border bg-primary-soft transition-shadow group-hover:shadow-raised">
                    {category.image ? (
                      <Image
                        src={category.image.url}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 140px, 22vw"
                        unoptimized={category.image.url.endsWith('.svg')}
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-primary">
                        <CategoryIcon name={category.icon} className="size-8 sm:size-10" />
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-xs font-medium sm:text-sm">
                    {category.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </HomeSection>
      ) : null}

      {deals.length > 0 ? (
        <HomeSection
          id="deals"
          title="Today’s deals"
          subtitle="20% off and more"
          href={'/products?sort=discount&discount=20' as Route}
        >
          <ProductRail products={deals} />
        </HomeSection>
      ) : null}

      {trending.length > 0 ? (
        <HomeSection
          id="trending"
          title="Trending now"
          subtitle="What shoppers are buying"
          href={'/products?sort=popular' as Route}
        >
          <ProductRail products={trending} />
        </HomeSection>
      ) : null}

      <PromoBanners />

      {featured.length > 0 ? (
        <HomeSection id="featured" title="Featured picks" href={'/products?featured=true' as Route}>
          <ProductGrid products={featured} />
        </HomeSection>
      ) : null}

      {newest.length > 0 ? (
        <HomeSection id="new-arrivals" title="New arrivals" href={'/products?sort=newest' as Route}>
          <ProductRail products={newest} />
        </HomeSection>
      ) : null}

      {topBrands.length > 0 ? (
        <HomeSection id="brands" title="Top brands">
          <ul className="flex flex-wrap gap-2">
            {topBrands.map((brand) => (
              <li key={brand.id}>
                <Link
                  href={`/products?brand=${brand.slug}` as Route}
                  className="inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-medium shadow-card hover:border-primary hover:text-primary"
                >
                  {brand.name}
                </Link>
              </li>
            ))}
          </ul>
        </HomeSection>
      ) : null}

      <RecommendedRail />
      <RecentlyViewedRail />

      {categories.length === 0 && deals.length === 0 && trending.length === 0 ? (
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
          <p className="rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">
            The catalogue is being stocked. Please check back shortly.
          </p>
        </div>
      ) : null}
    </>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-14 lg:py-16">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 size-72 rounded-full bg-accent/30 blur-2xl sm:size-96"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 left-1/3 size-72 rounded-full bg-primary-foreground/10 blur-2xl"
        />
        <div className="relative max-w-xl">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="size-3.5" aria-hidden="true" /> The big value days
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            Everything you need, from sellers you trust.
          </h1>
          <p className="mt-3 text-base text-pretty text-primary-foreground/85 sm:text-lg">
            Electronics, fashion, home and more — with secure payments and tracked delivery.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="accent">
              <Link href="/products?sort=discount">
                Shop today’s deals <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Link href="/categories">Browse categories</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PromoBanners() {
  const banners = [
    {
      icon: BadgePercent,
      title: 'Up to 60% off',
      text: 'Handpicked deals across every category',
      href: '/products?sort=discount&discount=40' as Route,
      tone: 'bg-accent text-accent-foreground',
    },
    {
      icon: Truck,
      title: 'Free delivery',
      text: 'On eligible orders from each seller',
      href: '/products?inStock=true' as Route,
      tone: 'bg-primary-soft text-primary',
    },
    {
      icon: ShieldCheck,
      title: 'Verified sellers',
      text: 'Every seller is reviewed before listing',
      href: '/categories' as Route,
      tone: 'bg-secondary text-secondary-foreground',
    },
  ];
  return (
    <section aria-label="Offers" className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8">
      <ul className="grid gap-3 sm:grid-cols-3">
        {banners.map(({ icon: Icon, title, text, href, tone }) => (
          <li key={title}>
            <Link
              href={href}
              className={`flex h-full items-center gap-4 rounded-2xl p-5 transition-transform hover:-translate-y-0.5 ${tone}`}
            >
              <Icon className="size-8 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm opacity-80">{text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
