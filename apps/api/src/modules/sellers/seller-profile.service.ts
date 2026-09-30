import type {
  PayoutAccountInput,
  SellerDashboard,
  SellerProfileUpdateInput,
  SellerProfileView,
} from '@zyventa/shared';
import type { Request } from 'express';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { encryptField } from '../../utils/crypto.js';
import { recordAudit } from '../audit/audit.service.js';
import { OrderItem } from '../orders/order-item.model.js';
import { ReturnRequest } from '../orders/return-request.model.js';
import { SellerOrder } from '../orders/seller-order.model.js';
import { ProductVariant } from '../products/product-variant.model.js';
import { toImageView } from '../products/product.mapper.js';
import { Product } from '../products/product.model.js';
import { SellerLedgerEntry } from './seller-ledger-entry.model.js';
import { Seller } from './seller.model.js';

const TZ = 'Asia/Kolkata';
const oid = (id: string) => new mongoose.Types.ObjectId(id);

export function createSellerProfileService() {
  async function load(sellerId: string): Promise<SellerProfileView> {
    const s = await Seller.findById(sellerId).lean();
    if (!s) throw ApiError.notFound('Seller not found');
    const p = s.pickupAddress;
    // Empty sub-documents are minimised away on save, so this may be missing.
    const payout = s.payoutAccount as typeof s.payoutAccount | undefined;
    return {
      id: s._id.toString(),
      storeName: s.storeName,
      slug: s.slug,
      description: s.description,
      logo: toImageView(s.logo, s.storeName),
      businessType: s.businessType,
      legalName: s.legalName,
      gstin: s.gstin ?? null,
      supportEmail: s.supportEmail ?? null,
      supportPhone: s.supportPhone ?? null,
      pickupAddress: {
        fullName: p.fullName,
        phone: p.phone,
        line1: p.line1,
        line2: p.line2,
        landmark: p.landmark,
        city: p.city,
        state: p.state,
        pincode: p.pincode,
      },
      status: s.status,
      statusReason: s.statusReason ?? null,
      commissionBps: s.commissionBps,
      ratingAvg: Math.round(s.ratingAvg * 10) / 10,
      ratingCount: s.ratingCount,
      payoutAccount: payout?.accountNumberLast4
        ? {
            accountHolderName: payout.accountHolderName ?? '',
            accountNumberLast4: payout.accountNumberLast4,
            ifsc: payout.ifsc ?? '',
            bankName: payout.bankName ?? '',
          }
        : null,
      approvedAt: s.approvedAt ? s.approvedAt.toISOString() : null,
    };
  }

  return {
    get: load,

    async update(
      req: Request,
      sellerId: string,
      input: SellerProfileUpdateInput,
    ): Promise<SellerProfileView> {
      const set: Record<string, unknown> = {};
      const unset: Record<string, 1> = {};
      if (input.description !== undefined) set.description = input.description;
      if (input.pickupAddress) set.pickupAddress = input.pickupAddress;
      for (const key of ['supportEmail', 'supportPhone'] as const) {
        const value = input[key];
        if (value === '') unset[key] = 1;
        else if (value !== undefined) set[key] = value;
      }
      if (input.logo !== undefined) set.logo = input.logo;
      await Seller.updateOne(
        { _id: sellerId },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { runValidators: true },
      );
      await recordAudit(req, {
        action: 'seller.profile_updated',
        resource: 'SELLER',
        resourceId: sellerId,
        metadata: { fields: Object.keys(input) },
        actorRole: 'SELLER',
      });
      return load(sellerId);
    },

    /** Bank details: full number encrypted at rest (AES-256-GCM, bound to the seller id). */
    async setPayoutAccount(
      req: Request,
      sellerId: string,
      input: PayoutAccountInput,
    ): Promise<SellerProfileView> {
      const encrypted = encryptField(input.accountNumber, sellerId);
      await Seller.updateOne(
        { _id: sellerId },
        {
          $set: {
            payoutAccount: {
              accountHolderName: input.accountHolderName,
              accountNumberEncrypted: encrypted,
              accountNumberLast4: input.accountNumber.slice(-4),
              ifsc: input.ifsc,
              bankName: input.bankName,
              verifiedAt: null,
            },
          },
        },
        { runValidators: true },
      );
      await recordAudit(req, {
        action: 'seller.payout_account_updated',
        resource: 'SELLER',
        resourceId: sellerId,
        metadata: { last4: input.accountNumber.slice(-4), ifsc: input.ifsc },
        actorRole: 'SELLER',
      });
      return load(sellerId);
    },

    async dashboard(sellerId: string, days: number): Promise<SellerDashboard> {
      const seller = oid(sellerId);
      const to = new Date();
      const from = new Date(to.getTime() - days * 86_400_000);
      const paid = { seller, paidAt: { $ne: null } };
      const inRange = { ...paid, createdAt: { $gte: from, $lte: to } };
      const counted = { ...inRange, status: { $nin: ['CANCELLED', 'REFUNDED'] } };

      const [
        byStatus,
        totals,
        series,
        top,
        units,
        pendingReturns,
        productCounts,
        stockCounts,
        ledger,
      ] = await Promise.all([
        SellerOrder.aggregate<{ _id: string; n: number }>([
          { $match: paid },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        SellerOrder.aggregate<{ revenue: number; orders: number }>([
          { $match: counted },
          {
            $group: {
              _id: null,
              revenue: { $sum: { $subtract: ['$pricing.subtotal', '$pricing.couponDiscount'] } },
              orders: { $sum: 1 },
            },
          },
        ]),
        SellerOrder.aggregate<{ _id: string; revenue: number; orders: number }>([
          { $match: counted },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
              revenue: { $sum: { $subtract: ['$pricing.subtotal', '$pricing.couponDiscount'] } },
              orders: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        OrderItem.aggregate<{
          _id: mongoose.Types.ObjectId;
          name: string;
          slug: string;
          units: number;
          revenue: number;
        }>([
          { $match: { seller, createdAt: { $gte: from }, status: { $ne: 'CANCELLED' } } },
          {
            $lookup: {
              from: 'sellerorders',
              localField: 'sellerOrder',
              foreignField: '_id',
              as: 'so',
              pipeline: [{ $project: { paidAt: 1 } }],
            },
          },
          { $match: { 'so.paidAt': { $ne: null } } },
          {
            $group: {
              _id: '$product',
              name: { $first: '$snapshot.name' },
              slug: { $first: '$snapshot.slug' },
              units: { $sum: '$quantity' },
              revenue: { $sum: '$lineTotal' },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
        ]),
        SellerOrder.aggregate<{ units: number }>([
          { $match: counted },
          { $group: { _id: null, units: { $sum: '$itemCount' } } },
        ]),
        ReturnRequest.countDocuments({
          seller,
          status: { $in: ['REQUESTED', 'APPROVED', 'PICKED_UP', 'RECEIVED'] },
        }),
        Product.aggregate<{ _id: string; n: number }>([
          { $match: { seller } },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        ProductVariant.aggregate<{ low: number; out: number }>([
          { $match: { seller, isActive: true } },
          { $project: { free: { $subtract: ['$stock', '$reserved'] }, lowStockThreshold: 1 } },
          {
            $group: {
              _id: null,
              out: { $sum: { $cond: [{ $lte: ['$free', 0] }, 1, 0] } },
              low: {
                $sum: {
                  $cond: [
                    { $and: [{ $gt: ['$free', 0] }, { $lte: ['$free', '$lowStockThreshold'] }] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        SellerLedgerEntry.aggregate<{ _id: string; amount: number }>([
          { $match: { seller, status: { $ne: 'VOID' } } },
          { $group: { _id: '$status', amount: { $sum: '$amount' } } },
        ]),
      ]);

      const seriesMap = new Map(series.map((s) => [s._id, s]));
      const points = [];
      for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
        const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
        const hit = seriesMap.get(key);
        points.push({ date: key, orders: hit?.orders ?? 0, revenue: hit?.revenue ?? 0 });
      }
      const revenue = totals[0]?.revenue ?? 0;
      const orders = totals[0]?.orders ?? 0;
      const statusCount = Object.fromEntries(productCounts.map((p) => [p._id, p.n]));
      const ledgerBy = Object.fromEntries(ledger.map((l) => [l._id, l.amount]));

      return {
        range: { days, from: from.toISOString(), to: to.toISOString() },
        revenue,
        orders,
        unitsSold: units[0]?.units ?? 0,
        averageOrderValue: orders > 0 ? Math.round(revenue / orders) : 0,
        ordersByStatus: Object.fromEntries(byStatus.map((b) => [b._id, b.n])),
        pendingReturns,
        products: {
          active: statusCount.ACTIVE ?? 0,
          draft: statusCount.DRAFT ?? 0,
          inactive: statusCount.INACTIVE ?? 0,
          blocked: statusCount.BLOCKED ?? 0,
        },
        lowStockVariants: stockCounts[0]?.low ?? 0,
        outOfStockVariants: stockCounts[0]?.out ?? 0,
        series: points,
        topProducts: top.map((t) => ({
          productId: t._id.toString(),
          name: t.name,
          slug: t.slug,
          units: t.units,
          revenue: t.revenue,
        })),
        balance: {
          pending: ledgerBy.PENDING ?? 0,
          available: ledgerBy.AVAILABLE ?? 0,
          paidOut: Math.abs(ledgerBy.PAID ?? 0),
        },
      };
    },
  };
}

export type SellerProfileService = ReturnType<typeof createSellerProfileService>;
