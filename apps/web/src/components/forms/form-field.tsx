'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  /** Extra element aligned with the label (e.g. "Forgot password?" link). */
  labelAside?: ReactNode;
  /** Element rendered inside the input on the right (e.g. a show-password toggle). */
  trailing?: ReactNode;
}

/**
 * Accessible text field: label bound via htmlFor, hint and error linked with
 * aria-describedby, aria-invalid on error. Works with react-hook-form's `register()`.
 */
export function TextField({
  label,
  error,
  hint,
  labelAside,
  trailing,
  className,
  ...inputProps
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      <div className="relative">
        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={trailing ? 'pr-11' : undefined}
          {...inputProps}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>
        ) : null}
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Password field with a show/hide toggle. */
export function PasswordField(props: Omit<FieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => {
            setVisible((v) => !v);
          }}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      }
    />
  );
}

interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'id'> {
  label: string;
  error?: string | undefined;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}

/** Native select (best mobile UX and accessibility) with the same label/error wiring. */
export function SelectField({
  label,
  error,
  options,
  placeholder,
  className,
  ...selectProps
}: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring aria-invalid:border-destructive sm:h-10 sm:text-sm"
        {...selectProps}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
