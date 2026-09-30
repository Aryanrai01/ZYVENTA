import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

export function HomeSection({
  id,
  title,
  subtitle,
  href,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  href?: Route;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id={id} className="text-xl font-bold tracking-tight sm:text-2xl">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View all <ArrowRight className="size-4" aria-hidden="true" />
            <span className="sr-only">{title}</span>
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
