'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  disabled = false,
  label = 'Quantity',
  size = 'md',
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const btn = cn(
    'inline-flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent',
    size === 'md' ? 'size-11' : 'size-9',
  );
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center overflow-hidden rounded-md border border-input bg-card"
    >
      <button
        type="button"
        className={btn}
        onClick={() => {
          onChange(value - 1);
        }}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <output
        aria-live="polite"
        className={cn(
          'min-w-10 text-center font-medium tabular-nums',
          size === 'sm' && 'min-w-8 text-sm',
        )}
      >
        {value}
      </output>
      <button
        type="button"
        className={btn}
        onClick={() => {
          onChange(value + 1);
        }}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
