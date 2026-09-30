'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Accessible slide-over panel (Radix Dialog: focus trap, Escape to close, scroll lock,
 * focus returned to the trigger). Used for the mobile menu, mobile filters and forms.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  side?: 'left' | 'right' | 'bottom' | 'center';
  title: string;
  description?: string;
  /** Visually hide the title (it is still announced). */
  hideTitle?: boolean;
  footer?: ReactNode;
}

const sideClasses: Record<NonNullable<SheetContentProps['side']>, string> = {
  left: 'inset-y-0 left-0 h-full w-[85vw] max-w-sm border-r data-[state=open]:animate-[sheet-in-left_200ms_ease-out]',
  right:
    'inset-y-0 right-0 h-full w-[90vw] max-w-md border-l data-[state=open]:animate-[sheet-in-right_200ms_ease-out]',
  bottom:
    'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-t data-[state=open]:animate-[sheet-in-bottom_200ms_ease-out]',
  center:
    'top-1/2 left-1/2 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border',
};

export function SheetContent({
  side = 'right',
  title,
  description,
  hideTitle = false,
  footer,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col bg-card text-card-foreground shadow-overlay outline-none',
          sideClasses[side],
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
          <DialogPrimitive.Title className={cn('text-base font-semibold', hideTitle && 'sr-only')}>
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="-mr-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        {description ? (
          <DialogPrimitive.Description className="px-4 pt-3 text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="border-t p-4">{footer}</div> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
