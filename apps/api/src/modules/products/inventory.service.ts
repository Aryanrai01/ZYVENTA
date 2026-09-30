import {
  buildPaginationMeta,
  type InventoryQuery,
  type InventoryRow,
  type PaginationMeta,
  type StockUpdateInput,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/cache.js';
import { recordAudit } from '../audit/audit.service.js';
import { notifyBackInStock } from '../stock-alerts/back-in-stock.js';
import { refreshProductAggregates } from './product-aggregates.js';
import { ProductVariant, type ProductVariantAttrs } from './product-variant.model.js';
import { toImageView } from './product.mapper.js';
import { Product, type ProductAttrs } from './product.model.js';

const availableExpr = { $subtract: ['$stock', '$reserved'] };

type VariantLean = ProductVariantAttrs & { _id: Types.ObjectId };
type ProductLean = Pick<ProductAttrs, 'name' | 'slug' | 'images'> & { _id: Types.ObjectId };

function toInventoryRow(v: VariantLean, p: ProductLean | undefined): InventoryRow {
  return {
    variantId: v._id.toString(),
    productId: v.product.toString(),
    productName: p?.name ?? '',
    productSlug: p?.slug ?? '',
    sku: v.sku,
    options: Object.fromEntries(
      Object.entries(v.options).filter(([, value]) => typeof value === 'string' && value),
    ),
    stock: v.stock,
    reserved: v.reserved,
    available: Math.max(0, v.stock - v.reserved),
    lowStockThreshold: v.lowStockThreshold,
    isActive: v.isActive,
    image: toImageView(v.images[0] ?? p?.images[0], p?.name ?? ''),
  };
}

export function createInventoryService(deps: {
  onProductChanged: (slug: string) => Promise<void>;
}) {
  return {
    async list(
      sellerId: string,
      query: InventoryQuery,
    ): Promise<{ items: InventoryRow[]; pagination: PaginationMeta }> {
      const filter: Record<string, unknown> = { seller: sellerId };
      if (query.filter === 'out') filter.$expr = { $lte: [availableExpr, 0] };
      if (query.filter === 'low') {
        filter.$expr = {
          $and: [{ $gt: [availableExpr, 0] }, { $lte: [availableExpr, '$lowStockThreshold'] }],
        };
      }
      if (query.q) {
        const pattern = new RegExp(escapeRegex(query.q), 'i');
        const productIds = await Product.find({ seller: sellerId, name: pattern })
          .select('_id')
          .limit(500)
          .lean();
        filter.$or = [
          { sku: new RegExp(`^${escapeRegex(query.q.toUpperCase())}`) },
          { product: { $in: productIds.map((p) => p._id) } },
        ];
      }

      const [total, variants] = await Promise.all([
        ProductVariant.countDocuments(filter),
        ProductVariant.find(filter)
          .sort({ stock: 1, _id: 1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean(),
      ]);
      const products = await Product.find({ _id: { $in: variants.map((v) => v.product) } })
        .select('name slug images status')
        .lean();
      const byId = new Map(products.map((p) => [p._id.toString(), p]));

      return {
        items: variants.map((v) => toInventoryRow(v, byId.get(v.product.toString()))),
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    /**
     * Sets or adjusts stock. The update is conditional on the result staying ≥ units reserved by
     * pending checkouts, so a seller can never "sell" reserved units twice. Runs in a transaction
     * with the product aggregate refresh and the audit record.
     */
    async updateStock(
      req: Request,
      sellerId: string,
      variantId: string,
      input: StockUpdateInput,
    ): Promise<InventoryRow> {
      const outcome = await mongoose.connection.transaction(async (session) => {
        const before = await ProductVariant.findOne({ _id: variantId, seller: sellerId })
          .session(session)
          .lean();
        if (!before) throw ApiError.notFound('Variant not found');

        const guard =
          'stock' in input
            ? { reserved: { $lte: input.stock } }
            : { $expr: { $gte: [{ $add: ['$stock', input.adjustBy] }, '$reserved'] } };
        const update =
          'stock' in input ? { $set: { stock: input.stock } } : { $inc: { stock: input.adjustBy } };

        const after = await ProductVariant.findOneAndUpdate(
          { _id: before._id, seller: sellerId, ...guard },
          update,
          {
            returnDocument: 'after',
            session,
          },
        ).lean();
        if (!after) {
          throw ApiError.conflict(
            `Stock cannot go below ${String(before.reserved)} unit(s) reserved by pending orders`,
          );
        }

        await refreshProductAggregates(after.product, session);
        const product = await Product.findById(after.product)
          .select('slug')
          .session(session)
          .lean();

        await recordAudit(
          req,
          {
            actorRole: 'SELLER',
            action: 'inventory.stock_changed',
            resource: 'PRODUCT_VARIANT',
            resourceId: after._id.toString(),
            metadata: {
              sku: after.sku,
              before: before.stock,
              after: after.stock,
              reserved: after.reserved,
            },
          },
          session,
        );
        return {
          productSlug: product?.slug ?? '',
          variantObjectId: after._id,
          becameAvailable: before.stock - before.reserved <= 0 && after.stock - after.reserved > 0,
        };
      });

      if (outcome.productSlug) await deps.onProductChanged(outcome.productSlug);
      if (outcome.becameAvailable) {
        notifyBackInStock(outcome.variantObjectId).catch((error: unknown) => {
          logger.error({ reason: String(error) }, 'Back-in-stock processing failed');
        });
      }

      const fresh = await ProductVariant.findById(variantId).lean();
      const product = fresh
        ? await Product.findById(fresh.product).select('name slug images').lean()
        : null;
      if (!fresh || !product) throw ApiError.notFound('Variant not found');
      return toInventoryRow(fresh, product);
    },
  };
}

export type InventoryService = ReturnType<typeof createInventoryService>;
