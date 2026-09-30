import {
  allocateProportionally,
  includedTax,
  type CartLineStatus,
  type DiscountType,
  type PricingBreakdown,
  type PromotionOwner,
} from '@zyventa/shared';

/**
 * Pure pricing rules shared by the cart and checkout. Everything is integer paise and is
 * derived from live catalogue data; nothing here ever sees a client-supplied price.
 *
 *   unit price    = list price − best automatic offer (one offer per line, never below ₹1)
 *   coupon        = order-level, on eligible lines only, allocated to lines by largest remainder
 *   shipping      = flat fee per seller shipment whose subtotal is below the free threshold
 *   total         = subtotal − coupon + shipping          (GST is included in prices)
 */
export const MIN_UNIT_PRICE = 100;

export interface Scope {
  categories: string[];
  products: string[];
  brands: string[];
  sellers: string[];
}

export interface PromotionRule {
  id: string;
  title: string;
  type: DiscountType;
  value: number;
  maxDiscount: number | null;
  scope: Scope;
}

export interface OfferRule extends PromotionRule {
  priority: number;
}

export interface CouponRule extends PromotionRule {
  code: string;
  minOrderAmount: number;
  fundedBy: PromotionOwner;
  ownerSeller: string | null;
}

export interface EngineLine {
  variantId: string;
  productId: string;
  sellerId: string;
  categoryPath: string[];
  brandId: string | null;
  quantity: number;
  status: CartLineStatus;
  maxQuantity: number;
  listPrice: number;
  mrp: number;
  gstRateBps: number;
}

export interface PricedLine {
  variantId: string;
  units: number;
  listPrice: number;
  unitPrice: number;
  offer: { id: string; title: string; discountPerUnit: number } | null;
  lineSubtotal: number;
  couponDiscount: number;
  lineTotal: number;
  taxIncluded: number;
  mrpTotal: number;
}

export interface PricedShipment {
  sellerId: string;
  itemCount: number;
  subtotal: number;
  couponDiscount: number;
  shippingFee: number;
  total: number;
}

export interface EngineResult {
  lines: PricedLine[];
  shipments: PricedShipment[];
  pricing: PricingBreakdown;
  coupon: { status: 'APPLIED'; discount: number } | { status: 'INVALID'; message: string } | null;
}

export interface ShippingRules {
  freeShippingThreshold: number;
  flatFeePerShipment: number;
}

export function matchesScope(
  scope: Scope,
  line: Pick<EngineLine, 'categoryPath' | 'productId' | 'brandId' | 'sellerId'>,
): boolean {
  if (scope.categories.length > 0 && !line.categoryPath.some((c) => scope.categories.includes(c)))
    return false;
  if (scope.products.length > 0 && !scope.products.includes(line.productId)) return false;
  if (scope.brands.length > 0 && (!line.brandId || !scope.brands.includes(line.brandId)))
    return false;
  if (scope.sellers.length > 0 && !scope.sellers.includes(line.sellerId)) return false;
  return true;
}

export function discountFor(
  rule: Pick<PromotionRule, 'type' | 'value' | 'maxDiscount'>,
  amount: number,
): number {
  const raw = rule.type === 'PERCENTAGE' ? Math.floor((amount * rule.value) / 100) : rule.value;
  const capped = rule.maxDiscount != null ? Math.min(raw, rule.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, amount));
}

/** Best automatic offer for one unit; ties go to the higher priority. Never below ₹1. */
export function bestOffer(
  line: Pick<EngineLine, 'categoryPath' | 'productId' | 'brandId' | 'sellerId' | 'listPrice'>,
  offers: OfferRule[],
): { rule: OfferRule; discountPerUnit: number } | null {
  let best: { rule: OfferRule; discountPerUnit: number } | null = null;
  const headroom = Math.max(0, line.listPrice - MIN_UNIT_PRICE);
  for (const offer of offers) {
    if (!matchesScope(offer.scope, line)) continue;
    const discount = Math.min(discountFor(offer, line.listPrice), headroom);
    if (discount <= 0) continue;
    if (
      !best ||
      discount > best.discountPerUnit ||
      (discount === best.discountPerUnit && offer.priority > best.rule.priority)
    ) {
      best = { rule: offer, discountPerUnit: discount };
    }
  }
  return best;
}

export const purchasableUnits = (line: Pick<EngineLine, 'status' | 'quantity' | 'maxQuantity'>) =>
  line.status === 'OK' || line.status === 'QUANTITY_REDUCED'
    ? Math.min(line.quantity, line.maxQuantity)
    : 0;

export function shippingFee(subtotal: number, rules: ShippingRules): number {
  if (subtotal <= 0) return 0;
  return subtotal >= rules.freeShippingThreshold ? 0 : rules.flatFeePerShipment;
}

export function priceOrder(
  input: EngineLine[],
  offers: OfferRule[],
  coupon: CouponRule | null,
  shipping: ShippingRules,
  formatMoney: (paise: number) => string = (p) => `₹${(p / 100).toFixed(2)}`,
): EngineResult {
  const lines: PricedLine[] = input.map((line) => {
    const units = purchasableUnits(line);
    const offer = bestOffer(line, offers);
    const unitPrice = line.listPrice - (offer?.discountPerUnit ?? 0);
    return {
      variantId: line.variantId,
      units,
      listPrice: line.listPrice,
      unitPrice,
      offer: offer
        ? { id: offer.rule.id, title: offer.rule.title, discountPerUnit: offer.discountPerUnit }
        : null,
      lineSubtotal: unitPrice * units,
      couponDiscount: 0,
      lineTotal: unitPrice * units,
      taxIncluded: 0,
      mrpTotal: Math.max(line.mrp, line.listPrice) * units,
    };
  });

  // ── Coupon ────────────────────────────────────────────────────────────────
  let couponResult: EngineResult['coupon'] = null;
  if (coupon) {
    const eligible = input
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line, index }) =>
          (lines[index]?.units ?? 0) > 0 &&
          matchesScope(coupon.scope, line) &&
          (coupon.fundedBy !== 'SELLER' || line.sellerId === coupon.ownerSeller),
      );
    const eligibleSubtotal = eligible.reduce(
      (sum, { index }) => sum + (lines[index]?.lineSubtotal ?? 0),
      0,
    );
    if (eligible.length === 0) {
      couponResult = {
        status: 'INVALID',
        message: 'This coupon doesn’t apply to the items in your cart',
      };
    } else if (eligibleSubtotal < coupon.minOrderAmount) {
      couponResult = {
        status: 'INVALID',
        message: `Add items worth ${formatMoney(coupon.minOrderAmount - eligibleSubtotal)} more to use this coupon`,
      };
    } else {
      const discount = discountFor(coupon, eligibleSubtotal);
      const shares = allocateProportionally(
        discount,
        eligible.map(({ index }) => lines[index]?.lineSubtotal ?? 0),
      );
      eligible.forEach(({ index }, i) => {
        const priced = lines[index];
        if (!priced) return;
        priced.couponDiscount = shares[i] ?? 0;
        priced.lineTotal = priced.lineSubtotal - priced.couponDiscount;
      });
      couponResult =
        discount > 0
          ? { status: 'APPLIED', discount }
          : { status: 'INVALID', message: 'No discount applies' };
    }
  }

  lines.forEach((priced, i) => {
    priced.taxIncluded = includedTax(priced.lineTotal, input[i]?.gstRateBps ?? 0);
  });

  // ── Shipments ─────────────────────────────────────────────────────────────
  const bySeller = new Map<string, PricedShipment>();
  input.forEach((line, i) => {
    const priced = lines[i];
    if (!priced || priced.units === 0) return;
    const s = bySeller.get(line.sellerId) ?? {
      sellerId: line.sellerId,
      itemCount: 0,
      subtotal: 0,
      couponDiscount: 0,
      shippingFee: 0,
      total: 0,
    };
    s.itemCount += priced.units;
    s.subtotal += priced.lineSubtotal;
    s.couponDiscount += priced.couponDiscount;
    bySeller.set(line.sellerId, s);
  });
  const shipments = [...bySeller.values()].map((s) => {
    const fee = shippingFee(s.subtotal, shipping);
    return { ...s, shippingFee: fee, total: s.subtotal - s.couponDiscount + fee };
  });

  type NumericKey = 'lineSubtotal' | 'couponDiscount' | 'taxIncluded' | 'mrpTotal';
  const sum = (key: NumericKey) => lines.reduce((total, l) => total + l[key], 0);
  const subtotal = sum('lineSubtotal');
  const couponDiscount = sum('couponDiscount');
  const fee = shipments.reduce((total, s) => total + s.shippingFee, 0);

  return {
    lines,
    shipments,
    pricing: {
      mrpTotal: sum('mrpTotal'),
      subtotal,
      couponDiscount,
      shippingFee: fee,
      taxIncluded: sum('taxIncluded'),
      total: subtotal - couponDiscount + fee,
    },
    coupon: couponResult,
  };
}
