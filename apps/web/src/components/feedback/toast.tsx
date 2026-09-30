'use client';

import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal toast notifications: a module-level queue rendered by <Toaster /> in a polite
 * live region, so screen readers announce "Added to cart" and similar confirmations.
 */
type ToastTone = 'success' | 'error';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: ToastItem[] = [];

function emit() {
  listeners.forEach((l) => {
    l();
  });
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(tone: ToastTone, message: string) {
  const id = nextId++;
  items = [...items.slice(-2), { id, tone, message }];
  emit();
  setTimeout(() => {
    dismiss(id);
  }, 4000);
}

export const toast = {
  success: (message: string) => {
    push('success', message);
  },
  error: (message: string) => {
    push('error', message);
  },
};

export function Toaster() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => EMPTY,
  );

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {current.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-overlay',
          )}
        >
          {t.tone === 'success' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          )}
          <p className="flex-1">{t.message}</p>
          <button
            type="button"
            onClick={() => {
              dismiss(t.id);
            }}
            className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss notification"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
