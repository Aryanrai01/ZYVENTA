import Link from 'next/link';
import { cn } from '@/lib/utils';

/** ZYVENTA wordmark with monogram. Decorative SVG; the link text carries the accessible name. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        'inline-flex items-center gap-2 rounded-md font-semibold tracking-tight',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M10 10.5h12l-12 11h12"
          fill="none"
          className="stroke-primary-foreground"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23.5" cy="8.5" r="2.5" className="fill-accent" />
      </svg>
      <span className="text-lg">ZYVENTA</span>
    </Link>
  );
}
