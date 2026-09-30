import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'flex gap-3 rounded-lg border p-3 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        info: 'border-info/30 bg-info/10 text-foreground [&_svg]:text-info',
        success: 'border-success/30 bg-success/10 text-foreground [&_svg]:text-success',
        warning: 'border-warning/40 bg-warning/15 text-foreground [&_svg]:text-warning-foreground',
        error: 'border-destructive/30 bg-destructive/10 text-foreground [&_svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

const icons = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: AlertCircle };

interface AlertProps extends VariantProps<typeof alertVariants> {
  title?: string;
  children?: ReactNode;
  className?: string;
}

/** Status message with an icon + text (never colour alone). Errors are announced assertively. */
export function Alert({ variant, title, children, className }: AlertProps) {
  const Icon = icons[variant ?? 'info'];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
    >
      <Icon aria-hidden="true" />
      <div className="space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
