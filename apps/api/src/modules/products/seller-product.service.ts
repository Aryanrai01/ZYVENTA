import { randomBytes } from 'node:crypto';
import {
  buildPaginationMeta,
  slugify,
  type CreateProductInput,
  type PaginationMeta,
  type SellerProductDetail,
  type SellerProductListQuery,
  type SellerProductRow,
  type UpdateProductInput,
  type VariantInput,
  type VariantUpdateInput,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { ClientSession, Types } from 'mongoose';
import { isProduction } from '../../config/env.js';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/cache.js';
import { recordAudit } from '../audit/audit.service.js';
import { Brand } from '../brands/brand.model.js';
import { Category } from '../categories/category.model.js';
import { sellerImageFolder, type ImageStorage } from '../uploads/image-storage.js';
import { refreshProductAggregates } from './product-aggregates.js';
import { ProductVariant, buildOptionsKey } from './product-variant.model.js';
import { toSellerProductDetail, toSellerProductRow } from './product.mapper.js';
import { Product } from './product.model.js';
import { sanitizeDescription } from './sanitize.js';
import { assertVariantsMatchAxes, extendAxes } from './variant-rules.js';

interface ImageInput {
  url: string;
  publicId?: string | undefined;
  alt?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

/**
 * Seller product management. EVERY query is scoped by `seller`, so a product id belonging to
 * another seller behaves exactly like a non-existent one (404) — no IDOR, no existence leak.
 */
export function createSellerProductService(deps: {
  storage: ImageStorage | null;
  onProductChanged: (slug: string) => Promise<void>;
}) {
  /** Images must come from our storage, inside this seller's folder (dev may use placeholders). */
  function assertOwnedImages(images: ImageInput[], sellerId: string): void {
    const folder = `${sellerImageFolder(sellerId)}/`;
    for (const image of images) {
      const isPlaceholder = image.url.startsWith('/placeholders/');
      if (isPlaceholder && !isProduction) continue;
      const fromStorage = deps.storage !== null && image.url.startsWith(deps.storage.urlPrefix);
      if (!fromStorage || !image.publicId?.startsWith(folder) || image.publicId.includes('..')) {
        throw ApiError.badRequest('Images must be uploaded through /uploads/images first');
      }
    }
  }

  async function assertLeafCategory(categoryId: string, session?: ClientSession) {
    const category = await Category.findOne({ _id: categoryId, isActive: true })
      .select('ancestors')
      .session(session ?? null)
      .lean();
    if (!category) throw ApiError.badRequest('Category not found');
    if (await Category.exists({ parent: category._id, isActive: true }).session(session ?? null)) {
      throw ApiError.badRequest('Choose the most specific category (it has subcategories)');
    }
    return { id: category._id, path: [...category.ancestors.map((a) => a._id), category._id] };
  }

  async function resolveBrand(brandId: string | null | undefined, session?: ClientSession) {
    if (!brandId) return { brand: null, brandName: '' };
    const brand = await Brand.findOne({ _id: brandId, isActive: true })
      .select('name')
      .session(session ?? null)
      .lean();
    if (!brand) throw ApiError.badRequest('Brand not found');
    return { brand: brand._id, brandName: brand.name };
  }

  async function uniqueProductSlug(name: string, session?: ClientSession): Promise<string> {
    const base = slugify(name).slice(0, 140) || 'product';
    if (!(await Product.exists({ slug: base }).session(session ?? null))) return base;
    return `${base}-${randomBytes(3).toString('hex')}`;
  }

  async function assertSkusFree(skus: string[], session?: ClientSession): Promise<void> {
    const dupInRequest = skus.find((sku, i) => skus.indexOf(sku) !== i);
    if (dupInRequest) throw ApiError.badRequest(`SKU ${dupInRequest} is used twice`);
    const taken = await ProductVariant.findOne({ sku: { $in: skus } })
      .select('sku')
      .session(session ?? null)
      .lean();
    if (taken) throw ApiError.conflict(`SKU ${taken.sku} is already in use`);
  }

  async function loadOwned(sellerId: string, productId: string, session?: ClientSession) {
    const product = await Product.findOne({
      _id: productId,
      seller: sellerId,
      status: { $ne: 'ARCHIVED' },
    }).session(session ?? null);
    if (!product) throw ApiError.notFound('Product not found');
    return product;
  }

  function toVariantDoc(
    v: VariantInput,
    productId: Types.ObjectId,
    sellerId: string,
    isDefault: boolean,
  ) {
    return {
      product: productId,
      seller: sellerId,
      sku: v.sku,
      options: v.options,
      optionsKey: buildOptionsKey(v.options),
      price: v.price,
      mrp: v.mrp,
      stock: v.stock,
      ...(v.lowStockThreshold !== undefined ? { lowStockThreshold: v.lowStockThreshold } : {}),
      images: v.images,
      isActive: v.isActive,
      isDefault,
    };
  }

  async function detailOf(productId: Types.ObjectId): Promise<SellerProductDetail> {
    const [product, variants] = await Promise.all([
      Product.findById(productId).lean(),
      ProductVariant.find({ product: productId }).sort({ isDefault: -1, createdAt: 1 }).lean(),
    ]);
    if (!product) throw ApiError.notFound('Product not found');
    return toSellerProductDetail(product, variants);
  }

  async function ensurePublishable(
    productId: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    const active = await ProductVariant.countDocuments({
      product: productId,
      isActive: true,
    }).session(session);
    if (active === 0)
      throw ApiError.badRequest('An active product needs at least one active variant');
  }

  return {
    async list(
      sellerId: string,
      query: SellerProductListQuery,
    ): Promise<{ items: SellerProductRow[]; pagination: PaginationMeta }> {
      const filter: Record<string, unknown> = {
        seller: sellerId,
        status: query.status ?? { $ne: 'ARCHIVED' },
      };
      if (query.q) {
        const variant = await ProductVariant.findOne({
          seller: sellerId,
          sku: query.q.toUpperCase(),
        })
          .select('product')
          .lean();
        filter.$or = [
          { name: new RegExp(escapeRegex(query.q), 'i') },
          ...(variant ? [{ _id: variant.product }] : []),
        ];
      }
      if (query.lowStock) {
        const low = await ProductVariant.distinct('product', {
          seller: sellerId,
          isActive: true,
          $expr: { $lte: [{ $subtract: ['$stock', '$reserved'] }, '$lowStockThreshold'] },
        });
        filter._id = { $in: low };
      }

      const [total, products] = await Promise.all([
        Product.countDocuments(filter),
        Product.find(filter)
          .sort({ updatedAt: -1, _id: 1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean(),
      ]);
      const variants = await ProductVariant.find({
        product: { $in: products.map((p) => p._id) },
      }).lean();
      return {
        items: products.map((p) =>
          toSellerProductRow(
            p,
            variants.filter((v) => v.product.equals(p._id)),
          ),
        ),
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    async get(sellerId: string, productId: string): Promise<SellerProductDetail> {
      const product = await Product.findOne({ _id: productId, seller: sellerId })
        .select('_id')
        .lean();
      if (!product) throw ApiError.notFound('Product not found');
      return detailOf(product._id);
    },

    async create(
      req: Request,
      sellerId: string,
      input: CreateProductInput,
    ): Promise<SellerProductDetail> {
      assertVariantsMatchAxes(input.variantOptions, input.variants);
      assertOwnedImages([...input.images, ...input.variants.flatMap((v) => v.images)], sellerId);

      const productId = await mongoose.connection.transaction(async (session) => {
        const [category, brand] = await Promise.all([
          assertLeafCategory(input.categoryId, session),
          resolveBrand(input.brandId, session),
        ]);
        await assertSkusFree(
          input.variants.map((v) => v.sku),
          session,
        );

        const { variants, categoryId: _c, brandId: _b, ...fields } = input;
        const [product] = await Product.create(
          [
            {
              ...fields,
              seller: sellerId,
              category: category.id,
              categoryPath: category.path,
              ...brand,
              slug: await uniqueProductSlug(input.name, session),
              description: sanitizeDescription(input.description),
              // Aggregates are computed below; start as DRAFT so validation of ACTIVE runs after.
              status: 'DRAFT',
            },
          ],
          { session },
        );
        if (!product) throw new Error('Product creation failed');

        await ProductVariant.insertMany(
          variants.map((v, i) => toVariantDoc(v, product._id, sellerId, i === 0)),
          { session },
        );
        await refreshProductAggregates(product._id, session);

        if (input.status !== 'DRAFT') {
          if (input.status === 'ACTIVE') await ensurePublishable(product._id, session);
          const fresh = await Product.findById(product._id).session(session);
          fresh?.set({
            status: input.status,
            ...(input.status === 'ACTIVE' ? { publishedAt: new Date() } : {}),
          });
          await fresh?.save({ session });
        }

        await recordAudit(
          req,
          {
            actorRole: 'SELLER',
            action: 'product.created',
            resource: 'PRODUCT',
            resourceId: product._id.toString(),
            metadata: { name: product.name, status: input.status, variants: variants.length },
          },
          session,
        );
        return product._id;
      });
      return detailOf(productId);
    },

    async update(
      req: Request,
      sellerId: string,
      productId: string,
      input: UpdateProductInput,
    ): Promise<SellerProductDetail> {
      if (input.images) assertOwnedImages(input.images, sellerId);

      const { id, slug } = await mongoose.connection.transaction(async (session) => {
        const product = await loadOwned(sellerId, productId, session);
        if (product.status === 'BLOCKED' && input.status) {
          throw ApiError.forbidden(
            `This product was blocked by ZYVENTA${product.statusReason ? `: ${product.statusReason}` : ''}. Contact support.`,
          );
        }

        const { categoryId, brandId, description, status, ...fields } = input;
        const changes: Record<string, unknown> = { ...fields };
        if (categoryId) {
          const category = await assertLeafCategory(categoryId, session);
          Object.assign(changes, { category: category.id, categoryPath: category.path });
        }
        if (brandId !== undefined) Object.assign(changes, await resolveBrand(brandId, session));
        if (description !== undefined) changes.description = sanitizeDescription(description);
        if (status) {
          if (status === 'ACTIVE') await ensurePublishable(product._id, session);
          changes.status = status;
          if (status === 'ACTIVE' && !product.publishedAt) changes.publishedAt = new Date();
        }

        const before = { name: product.name, status: product.status };
        product.set(changes);
        await product.save({ session }); // validates (e.g. ACTIVE needs images) and rebuilds search tokens

        await recordAudit(
          req,
          {
            actorRole: 'SELLER',
            action:
              status && status !== before.status ? 'product.status_changed' : 'product.updated',
            resource: 'PRODUCT',
            resourceId: product._id.toString(),
            metadata: { before, fields: Object.keys(input) },
          },
          session,
        );
        return { id: product._id, slug: product.slug };
      });
      await deps.onProductChanged(slug);
      return detailOf(id);
    },

    /** Soft delete: orders keep referencing the product, shoppers stop seeing it. */
    async archive(req: Request, sellerId: string, productId: string): Promise<void> {
      const slug = await mongoose.connection.transaction(async (session) => {
        const product = await loadOwned(sellerId, productId, session);
        product.set({ status: 'ARCHIVED', isFeatured: false });
        await product.save({ session, validateBeforeSave: false });
        await ProductVariant.updateMany(
          { product: product._id },
          { $set: { isActive: false } },
          { session },
        );
        await refreshProductAggregates(product._id, session);
        await recordAudit(
          req,
          {
            actorRole: 'SELLER',
            action: 'product.archived',
            resource: 'PRODUCT',
            resourceId: product._id.toString(),
            metadata: { name: product.name },
          },
          session,
        );
        return product.slug;
      });
      await deps.onProductChanged(slug);
    },

    async addVariant(
      req: Request,
      sellerId: string,
      productId: string,
      input: VariantInput,
    ): Promise<SellerProductDetail> {
      assertOwnedImages(input.images, sellerId);
      const { id, slug } = await mongoose.connection.transaction(async (session) => {
        const product = await loadOwned(sellerId, productId, session);
        if (product.variantOptions.length === 0) {
          throw ApiError.badRequest(
            'This product has no variant options (e.g. colour, size), so it has a single variant',
          );
        }
        const axes = extendAxes(
          product.variantOptions.map((o) => ({ name: o.name, values: [...o.values] })),
          input.options,
        );
        const existing = await ProductVariant.find({ product: product._id })
          .select('options')
          .session(session)
          .lean();
        assertVariantsMatchAxes(axes, [
          ...existing.map((v) => ({
            options: Object.fromEntries(Object.entries(v.options).filter(([, x]) => x)),
          })),
          { options: input.options },
        ]);
        await assertSkusFree([input.sku], session);

        product.set({ variantOptions: axes });
        await product.save({ session });
        const [variant] = await ProductVariant.create(
          [toVariantDoc(input, product._id, sellerId, false)],
          { session },
        );
        await refreshProductAggregates(product._id, session);
        await recordAudit(
          req,
          {
            actorRole: 'SELLER',
            action: 'variant.created',
            resource: 'PRODUCT_VARIANT',
            resourceId: variant?._id.toString() ?? '',
            metadata: {
              product: product._id.toString(),
              sku: input.sku,
              price: input.price,
              stock: input.stock,
            },
          },
          session,
        );
        return { id: product._id, slug: product.slug };
      });
      await deps.onProductChanged(slug);
      return detailOf(id);
    },

    async updateVariant(
      req: Request,
      sellerId: string,
      productId: string,
      variantId: string,
      input: VariantUpdateInput,
    ): Promise<SellerProductDetail> {
      if (input.images) assertOwnedImages(input.images, sellerId);
      const { id, slug } = await mongoose.connection.transaction(async (session) => {
        const product = await loadOwned(sellerId, productId, session);
        const variant = await ProductVariant.findOne({
          _id: variantId,
          product: product._id,
          seller: sellerId,
        }).session(session);
        if (!variant) throw ApiError.notFound('Variant not found');

        if (input.sku && input.sku !== variant.sku) await assertSkusFree([input.sku], session);
        if (input.isActive === false && variant.isActive && product.status === 'ACTIVE') {
          const others = await ProductVariant.countDocuments({
            product: product._id,
            isActive: true,
            _id: { $ne: variant._id },
          }).session(session);
          if (others === 0) {
            throw ApiError.conflict(
              'This is the last active variant — deactivate the product instead',
            );
          }
        }

        const before = {
          price: variant.price,
          mrp: variant.mrp,
          sku: variant.sku,
          isActive: variant.isActive,
        };
        variant.set(input);
        await variant.save({ session }); // re-validates price ≤ MRP with merged values
        await refreshProductAggregates(product._id, session);

        const priceChanged = before.price !== variant.price || before.mrp !== variant.mrp;
        await recordAudit(
          req,
          {
            actorRole: 'SELLER',
            action: priceChanged ? 'variant.price_changed' : 'variant.updated',
            resource: 'PRODUCT_VARIANT',
            resourceId: variant._id.toString(),
            metadata: {
              product: product._id.toString(),
              before,
              after: {
                price: variant.price,
                mrp: variant.mrp,
                sku: variant.sku,
                isActive: variant.isActive,
              },
            },
          },
          session,
        );
        return { id: product._id, slug: product.slug };
      });
      await deps.onProductChanged(slug);
      return detailOf(id);
    },
  };
}

export type SellerProductService = ReturnType<typeof createSellerProductService>;
