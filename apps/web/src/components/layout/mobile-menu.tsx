'use client';

import type { CategoryNode } from '@zyventa/shared';
import { ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const categoryHref = (slug: string) => `/categories/${slug}` as Route;

/** Slide-in navigation for phones and tablets: category tree plus key links. */
export function MobileMenu({ categories }: { categories: CategoryNode[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after navigating (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex size-10 items-center justify-center rounded-md hover:bg-muted lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="left" title="Shop by category">
        <nav aria-label="Categories" className="p-2">
          <ul className="space-y-0.5">
            {categories.map((root) => (
              <li key={root.id}>
                {root.children.length > 0 ? (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2.5 font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
                      {root.name}
                      <ChevronDown
                        className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <ul className="mb-2 ml-3 border-l pl-2">
                      <li>
                        <Link
                          href={categoryHref(root.slug)}
                          className="block rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
                        >
                          All {root.name}
                        </Link>
                      </li>
                      {root.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={categoryHref(child.slug)}
                            className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <Link
                    href={categoryHref(root.slug)}
                    className="block rounded-md px-3 py-2.5 font-medium hover:bg-muted"
                  >
                    {root.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <hr className="my-3" />
          <ul className="space-y-0.5 text-sm">
            <li>
              <Link
                href="/products?sort=discount"
                className="block rounded-md px-3 py-2 hover:bg-muted"
              >
                Today’s deals
              </Link>
            </li>
            <li>
              <Link
                href="/products?sort=newest"
                className="block rounded-md px-3 py-2 hover:bg-muted"
              >
                New arrivals
              </Link>
            </li>
            <li>
              <Link href="/categories" className="block rounded-md px-3 py-2 hover:bg-muted">
                All categories
              </Link>
            </li>
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
