import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';

export interface Crumb {
  name: string;
  href?: Route;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li key={`${item.name}-${String(index)}`} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3.5" aria-hidden="true" /> : null}
            {item.href && index < items.length - 1 ? (
              <Link href={item.href} className="hover:text-foreground hover:underline">
                {item.name}
              </Link>
            ) : (
              <span
                aria-current={index === items.length - 1 ? 'page' : undefined}
                className="text-foreground"
              >
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
