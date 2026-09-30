import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-14 text-center',
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
