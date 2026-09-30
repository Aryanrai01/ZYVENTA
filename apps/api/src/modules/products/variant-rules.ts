import type { VariantOptionKey, VariantOptions } from '@zyventa/shared';
import { ApiError } from '../../utils/ApiError.js';
import { buildOptionsKey } from './product-variant.model.js';

export interface VariantAxis {
  name: VariantOptionKey;
  values: string[];
}

const norm = (value: string) => value.trim().toLowerCase();

/**
 * Validates variant option combinations against the product's axes:
 *  - simple product (no axes) → exactly one variant, with no options;
 *  - otherwise every variant sets exactly the product's axes, each value is one of the
 *    axis values (case-insensitive), and no combination appears twice.
 * Throws a 400 describing the first problem.
 */
export function assertVariantsMatchAxes(
  axes: VariantAxis[],
  variants: { options: VariantOptions }[],
): void {
  const axisNames = axes.map((a) => a.name);
  if (axes.length === 0) {
    if (variants.length !== 1) {
      throw ApiError.badRequest('A product without variant options must have exactly one variant');
    }
    if (Object.values(variants[0]?.options ?? {}).some(Boolean)) {
      throw ApiError.badRequest(
        'Define variant options (e.g. colour, size) before giving variants options',
      );
    }
    return;
  }

  const seen = new Set<string>();
  variants.forEach((variant, index) => {
    const keys = (Object.keys(variant.options) as VariantOptionKey[]).filter(
      (k) => variant.options[k],
    );
    const missing = axisNames.filter((a) => !keys.includes(a));
    const extra = keys.filter((k) => !axisNames.includes(k));
    if (missing.length > 0 || extra.length > 0) {
      throw ApiError.badRequest(
        `Variant ${String(index + 1)} must set exactly: ${axisNames.join(', ')}` +
          (extra.length ? ` (unexpected: ${extra.join(', ')})` : ''),
      );
    }
    for (const axis of axes) {
      const value = variant.options[axis.name] ?? '';
      if (!axis.values.some((v) => norm(v) === norm(value))) {
        throw ApiError.badRequest(
          `Variant ${String(index + 1)}: "${value}" is not a listed ${axis.name}`,
        );
      }
    }
    const key = buildOptionsKey(variant.options);
    if (seen.has(key)) {
      throw ApiError.badRequest(
        `Variant ${String(index + 1)} duplicates another option combination`,
      );
    }
    seen.add(key);
  });
}

/** Returns axes with any new values from `options` appended (used when adding a variant). */
export function extendAxes(axes: VariantAxis[], options: VariantOptions): VariantAxis[] {
  return axes.map((axis) => {
    const value = options[axis.name];
    if (!value || axis.values.some((v) => norm(v) === norm(value))) return axis;
    if (axis.values.length >= 30)
      throw ApiError.badRequest(`Too many ${axis.name} values (max 30)`);
    return { ...axis, values: [...axis.values, value.trim()] };
  });
}
