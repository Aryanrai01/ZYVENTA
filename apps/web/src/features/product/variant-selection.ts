import type { VariantOptionKey, VariantOptions, VariantView } from '@zyventa/shared';

/**
 * Pure variant-picker logic: which combination is selected, which option values are
 * available, and how to move to the closest valid variant when a value is chosen.
 */
export type Selection = VariantOptions;

export function matches(variant: VariantView, selection: Selection): boolean {
  return Object.entries(selection).every(
    ([key, value]) => variant.options[key as VariantOptionKey] === value,
  );
}

export function initialVariant(
  variants: VariantView[],
  preferredId?: string | null,
): VariantView | undefined {
  return (
    variants.find((v) => v.id === preferredId) ??
    variants.find((v) => v.isDefault && v.inStock) ??
    variants.find((v) => v.inStock) ??
    variants.find((v) => v.isDefault) ??
    variants[0]
  );
}

export type ValueState = 'selected' | 'available' | 'out-of-stock' | 'unavailable';

/**
 * State of one option value given the other current choices:
 * - available: a variant with this value AND the other selected values exists and is in stock
 * - out-of-stock: it exists but is sold out
 * - unavailable: no such combination (still clickable; we jump to the nearest variant)
 */
export function valueState(
  variants: VariantView[],
  current: VariantView | undefined,
  axis: VariantOptionKey,
  value: string,
): ValueState {
  if (current?.options[axis] === value) return 'selected';
  const others: Selection = { ...current?.options };
  Reflect.deleteProperty(others, axis);
  const candidates = variants.filter((v) => v.options[axis] === value && matches(v, others));
  if (candidates.length === 0) return 'unavailable';
  return candidates.some((v) => v.inStock) ? 'available' : 'out-of-stock';
}

/** Picks the best variant after choosing `axis = value`: most other options kept, in stock first. */
export function selectValue(
  variants: VariantView[],
  current: VariantView | undefined,
  axis: VariantOptionKey,
  value: string,
): VariantView | undefined {
  const withValue = variants.filter((v) => v.options[axis] === value);
  const score = (v: VariantView) => {
    let kept = 0;
    for (const [key, val] of Object.entries(current?.options ?? {})) {
      if (key !== axis && v.options[key as VariantOptionKey] === val) kept += 1;
    }
    return kept * 2 + (v.inStock ? 1 : 0);
  };
  return withValue.sort((a, b) => score(b) - score(a))[0] ?? current;
}
