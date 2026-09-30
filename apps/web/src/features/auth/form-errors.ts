import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '@/lib/api-client';

/**
 * Maps an API error onto the form: field errors (`body.email`) go to their inputs, anything
 * else becomes the returned form-level message.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string {
  if (!(error instanceof ApiClientError)) return 'Something went wrong. Please try again.';
  let mapped = false;
  for (const fieldError of error.errors) {
    const name = fieldError.path.replace(/^body\./, '') as Path<T>;
    if (fields.includes(name)) {
      setError(name, { type: 'server', message: fieldError.message });
      mapped = true;
    }
  }
  if (mapped && error.code === 'VALIDATION_ERROR') return '';
  if (error.code === 'RATE_LIMITED')
    return 'Too many attempts. Please wait a few minutes and try again.';
  if (error.code === 'NETWORK_ERROR') return error.message;
  return error.message;
}
