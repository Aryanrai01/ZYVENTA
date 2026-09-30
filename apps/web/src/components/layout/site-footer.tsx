import { ShieldCheck, Truck, Undo2 } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { Logo } from './logo';

const COLUMNS: { title: string; links: { label: string; href: Route }[] }[] = [
  {
    title: 'Shop',
    links: [
      { label: 'All categories', href: '/categories' },
      { label: 'Today’s deals', href: '/products?sort=discount' as Route },
      { label: 'New arrivals', href: '/products?sort=newest' as Route },
      { label: 'Top rated', href: '/products?sort=rating' as Route },
    ],
  },
  {
    title: 'Your account',
    links: [
      { label: 'Account', href: '/account' },
      { label: 'Addresses', href: '/account/addresses' },
      { label: 'Wishlist', href: '/wishlist' },
      { label: 'Cart', href: '/cart' },
    ],
  },
  {
    title: 'Sell on ZYVENTA',
    links: [
      { label: 'Start selling', href: '/sell' },
      { label: 'Seller Center', href: '/seller' },
    ],
  },
];

const PROMISES = [
  { icon: ShieldCheck, text: 'Secure payments' },
  { icon: Truck, text: 'Tracked delivery' },
  { icon: Undo2, text: 'Easy returns' },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="grid gap-4 border-b py-6 sm:grid-cols-3">
          {PROMISES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm font-medium">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
        <div className="grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              A marketplace of verified Indian sellers — electronics, fashion, home and more.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold">{column.title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="hover:text-foreground hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="border-t py-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} ZYVENTA. Prices include GST.
        </p>
      </div>
    </footer>
  );
}
