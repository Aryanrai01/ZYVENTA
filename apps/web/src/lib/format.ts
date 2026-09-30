/**
 * Money is stored and transported as integer paise (see docs/ARCHITECTURE.md). These helpers
 * are the only place paise are converted for display.
 */
const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPrice(paise: number): string {
  if (!Number.isFinite(paise)) return '—';
  return inrFormatter.format(paise / 100);
}

export { discountPercent } from '@zyventa/shared';
