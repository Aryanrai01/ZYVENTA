/**
 * Pure money helpers used by the API pricing engine and for display on the web.
 * All amounts are integer paise; rates are basis points (1% = 100 bps).
 */

/** Whole-number discount percentage from MRP, floored so a discount is never overstated. */
export function discountPercent(pricePaise: number, mrpPaise: number): number {
  if (mrpPaise <= 0 || pricePaise >= mrpPaise) return 0;
  return Math.floor(((mrpPaise - pricePaise) / mrpPaise) * 100);
}

/** `amount × bps / 10 000`, rounded half-up to whole paise. */
export function applyBps(amountPaise: number, bps: number): number {
  return Math.round((amountPaise * bps) / 10_000);
}

/**
 * GST contained in a tax-inclusive price: `price × r / (1 + r)`.
 * Indian retail prices (MRP convention) include GST, so tax is extracted, never added.
 */
export function includedTax(inclusivePaise: number, gstRateBps: number): number {
  if (gstRateBps <= 0) return 0;
  return Math.round((inclusivePaise * gstRateBps) / (10_000 + gstRateBps));
}

/**
 * Splits `total` across `weights` proportionally with the largest-remainder method, so the
 * parts always sum exactly to `total` (used to allocate an order-level coupon across items).
 */
export function allocateProportionally(total: number, weights: readonly number[]): number[] {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0 || total === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((sum, v) => sum + v, 0);

  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}
