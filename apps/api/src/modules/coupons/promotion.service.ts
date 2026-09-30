import {
  buildPaginationMeta,
  type CouponInput,
  type CouponUpdateInput,
  type CouponView,
  type OfferInput,
  type OfferUpdateInput,
  type OfferView,
  type PromotionListQuery,
  type PublicCoupon,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { ClientSession, Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex, type JsonCache } from '../../utils/cache.js';
import { recordAudit } from '../audit/audit.service.js';
import { Offer, type OfferAttrs } from '../offers/offer.model.js';
import { Order } from '../orders/order.model.js';
import type { CouponRule, OfferRule, Scope } from '../pricing/pricing-engine.js';
import { CouponRedemption } from './coupon-redemption.model.js';
import { Coupon, type CouponAttrs } from './coupon.model.js';

type CouponLean = CouponAttrs & { _id: Types.ObjectId };
type OfferLean = OfferAttrs & { _id: Types.ObjectId };
type ScopeLike =
  | {
      categories?: Types.ObjectId[];
      products?: Types.ObjectId[];
      brands?: Types.ObjectId[];
      sellers?: Types.ObjectId[];
    }
  | null
  | undefined;

const OFFERS_KEY = 'promotions:active-offers';

/** Owner of a promotion request: the platform (admin) or one seller. */
export type PromotionOwnerContext = { kind: 'PLATFORM' } | { kind: 'SELLER'; sellerId: string };

function toScope(scope: ScopeLike): Scope {
  const ids = (list: Types.ObjectId[] | undefined) => (list ?? []).map((id) => id.toString());
  return {
    categories: ids(scope?.categories),
    products: ids(scope?.products),
    brands: ids(scope?.brands),
    sellers: ids(scope?.sellers),
  };
}

export function toCouponView(c: CouponLean): CouponView {
  return {
    id: c._id.toString(),
    code: c.code,
    title: c.title,
    description: c.description,
    type: c.type,
    value: c.value,
    maxDiscount: c.maxDiscount ?? null,
    minOrderAmount: c.minOrderAmount,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    usageLimit: c.usageLimit ?? null,
    usedCount: c.usedCount,
    perUserLimit: c.perUserLimit,
    firstOrderOnly: c.firstOrderOnly,
    visibility: c.visibility,
    fundedBy: c.fundedBy,
    isActive: c.isActive,
    scope: toScope(c.scope),
  };
}

export function toOfferView(o: OfferLean): OfferView {
  return {
    id: o._id.toString(),
    title: o.title,
    description: o.description,
    owner: o.owner,
    type: o.type,
    value: o.value,
    maxDiscount: o.maxDiscount ?? null,
    startsAt: o.startsAt.toISOString(),
    endsAt: o.endsAt.toISOString(),
    priority: o.priority,
    isActive: o.isActive,
    scope: toScope(o.scope),
  };
}

function statusFilter(status: PromotionListQuery['status']): Record<string, unknown> {
  const now = new Date();
  switch (status) {
    case 'active':
      return { isActive: true, startsAt: { $lte: now }, endsAt: { $gt: now } };
    case 'scheduled':
      return { isActive: true, startsAt: { $gt: now } };
    case 'expired':
      return { endsAt: { $lte: now } };
    case 'disabled':
      return { isActive: false };
    default:
      return {};
  }
}

/** Sellers can only target their own catalogue: seller scope is forced to themselves. */
function scopedInput<T extends { scope: Scope }>(input: T, owner: PromotionOwnerContext): T {
  if (owner.kind === 'PLATFORM') return input;
  return { ...input, scope: { ...input.scope, sellers: [owner.sellerId] } };
}

function ownerFilter(
  owner: PromotionOwnerContext,
  kind: 'coupon' | 'offer',
): Record<string, unknown> {
  if (owner.kind === 'PLATFORM')
    return kind === 'coupon' ? { fundedBy: 'PLATFORM' } : { owner: 'PLATFORM' };
  return kind === 'coupon' ? { ownerSeller: owner.sellerId } : { seller: owner.sellerId };
}

export function createPromotionService(deps: { cache: JsonCache }) {
  const { cache } = deps;

  async function audit(
    req: Request,
    action: string,
    resource: 'COUPON' | 'OFFER',
    id: string,
    owner: PromotionOwnerContext,
    metadata: Record<string, unknown> = {},
  ) {
    await recordAudit(req, {
      action,
      resource,
      resourceId: id,
      metadata,
      actorRole: owner.kind === 'PLATFORM' ? 'ADMIN' : 'SELLER',
    });
  }

  return {
    /** Currently running offers (cached briefly; invalidated on every offer change). */
    async activeOffers(): Promise<OfferRule[]> {
      return cache.wrap(OFFERS_KEY, 60, async () => {
        const now = new Date();
        const docs = await Offer.find({
          isActive: true,
          startsAt: { $lte: now },
          endsAt: { $gt: now },
        })
          .limit(500)
          .lean<OfferLean[]>();
        return docs.map((o) => ({
          id: o._id.toString(),
          title: o.title,
          type: o.type,
          value: o.value,
          maxDiscount: o.maxDiscount ?? null,
          priority: o.priority,
          scope: toScope(o.scope),
        }));
      });
    },

    /**
     * Resolves a code into a coupon rule for this user, or a shopper-friendly reason why it
     * can't be used. Scope and minimum-order checks happen in the pricing engine.
     */
    async resolveCoupon(
      code: string,
      userId: string,
      session?: ClientSession,
    ): Promise<{ rule: CouponRule } | { error: string }> {
      const c = await Coupon.findOne({ code: code.toUpperCase() })
        .session(session ?? null)
        .lean<CouponLean>();
      const now = new Date();
      if (!c || !c.isActive) return { error: 'This coupon code is not valid' };
      if (c.startsAt > now) return { error: 'This coupon is not active yet' };
      if (c.endsAt <= now) return { error: 'This coupon has expired' };
      if (c.usageLimit != null && c.usedCount >= c.usageLimit)
        return { error: 'This coupon has been fully redeemed' };
      const used = await CouponRedemption.countDocuments({
        coupon: c._id,
        user: userId,
        status: { $in: ['RESERVED', 'CONSUMED'] },
      }).session(session ?? null);
      if (used >= c.perUserLimit) return { error: 'You have already used this coupon' };
      if (c.firstOrderOnly) {
        const previous = await Order.exists({
          user: userId,
          paymentStatus: { $in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
        }).session(session ?? null);
        if (previous) return { error: 'This coupon is for your first order only' };
      }
      return {
        rule: {
          id: c._id.toString(),
          code: c.code,
          title: c.title,
          type: c.type,
          value: c.value,
          maxDiscount: c.maxDiscount ?? null,
          minOrderAmount: c.minOrderAmount,
          fundedBy: c.fundedBy,
          ownerSeller: c.ownerSeller ? c.ownerSeller.toString() : null,
          scope: toScope(c.scope),
        },
      };
    },

    async publicCoupons(): Promise<PublicCoupon[]> {
      return cache.wrap('promotions:public-coupons', 120, async () => {
        const now = new Date();
        const docs = await Coupon.find({
          isActive: true,
          visibility: 'PUBLIC',
          startsAt: { $lte: now },
          endsAt: { $gt: now },
        })
          .sort({ endsAt: 1 })
          .limit(30)
          .lean<CouponLean[]>();
        return docs
          .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
          .map((c) => ({
            code: c.code,
            title: c.title,
            description: c.description,
            type: c.type,
            value: c.value,
            maxDiscount: c.maxDiscount ?? null,
            minOrderAmount: c.minOrderAmount,
            endsAt: c.endsAt.toISOString(),
          }));
      });
    },

    // ── Coupons (admin: platform-funded; seller: own-funded) ────────────────
    async listCoupons(owner: PromotionOwnerContext, query: PromotionListQuery) {
      const filter = {
        ...ownerFilter(owner, 'coupon'),
        ...statusFilter(query.status),
        ...(query.q ? { code: new RegExp(`^${escapeRegex(query.q.toUpperCase())}`) } : {}),
      };
      const [total, docs] = await Promise.all([
        Coupon.countDocuments(filter),
        Coupon.find(filter)
          .sort({ createdAt: -1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean<CouponLean[]>(),
      ]);
      return {
        items: docs.map(toCouponView),
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    async createCoupon(
      req: Request,
      owner: PromotionOwnerContext,
      input: CouponInput,
    ): Promise<CouponView> {
      const data = scopedInput(input, owner);
      try {
        const doc = await Coupon.create({
          ...data,
          fundedBy: owner.kind === 'PLATFORM' ? 'PLATFORM' : 'SELLER',
          ownerSeller: owner.kind === 'SELLER' ? owner.sellerId : null,
          createdBy: req.auth?.userId,
        });
        await audit(req, 'coupon.created', 'COUPON', doc._id.toString(), owner, { code: doc.code });
        await cache.invalidate('promotions:public-coupons');
        return toCouponView(doc.toObject());
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          throw ApiError.conflict('That coupon code is already taken');
        throw error;
      }
    },

    async updateCoupon(
      req: Request,
      owner: PromotionOwnerContext,
      id: string,
      input: CouponUpdateInput,
    ): Promise<CouponView> {
      const doc = await Coupon.findOne({ _id: id, ...ownerFilter(owner, 'coupon') });
      if (!doc) throw ApiError.notFound('Coupon not found');
      const next = input.scope ? scopedInput({ ...input, scope: input.scope }, owner) : input;
      doc.set(next);
      await doc.save();
      await audit(req, 'coupon.updated', 'COUPON', id, owner, { fields: Object.keys(input) });
      await cache.invalidate('promotions:public-coupons');
      return toCouponView(doc.toObject());
    },

    // ── Offers ────────────────────────────────────────────────────────────────
    async listOffers(owner: PromotionOwnerContext, query: PromotionListQuery) {
      const filter = {
        ...ownerFilter(owner, 'offer'),
        ...statusFilter(query.status),
        ...(query.q ? { title: new RegExp(escapeRegex(query.q), 'i') } : {}),
      };
      const [total, docs] = await Promise.all([
        Offer.countDocuments(filter),
        Offer.find(filter)
          .sort({ createdAt: -1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean<OfferLean[]>(),
      ]);
      return {
        items: docs.map(toOfferView),
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    async createOffer(
      req: Request,
      owner: PromotionOwnerContext,
      input: OfferInput,
    ): Promise<OfferView> {
      const doc = await Offer.create({
        ...scopedInput(input, owner),
        owner: owner.kind,
        seller: owner.kind === 'SELLER' ? owner.sellerId : null,
        createdBy: req.auth?.userId,
      });
      await audit(req, 'offer.created', 'OFFER', doc._id.toString(), owner, { title: doc.title });
      await cache.invalidate(OFFERS_KEY);
      return toOfferView(doc.toObject());
    },

    async updateOffer(
      req: Request,
      owner: PromotionOwnerContext,
      id: string,
      input: OfferUpdateInput,
    ): Promise<OfferView> {
      const doc = await Offer.findOne({ _id: id, ...ownerFilter(owner, 'offer') });
      if (!doc) throw ApiError.notFound('Offer not found');
      const next = input.scope ? scopedInput({ ...input, scope: input.scope }, owner) : input;
      doc.set(next);
      await doc.save();
      await audit(req, 'offer.updated', 'OFFER', id, owner, { fields: Object.keys(input) });
      await cache.invalidate(OFFERS_KEY);
      return toOfferView(doc.toObject());
    },
  };
}

export type PromotionService = ReturnType<typeof createPromotionService>;
export const objectId = (id: string) => new mongoose.Types.ObjectId(id);
