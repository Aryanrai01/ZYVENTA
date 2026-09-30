import {
  slugify,
  type BrandInput,
  type BrandSummary,
  type BrandUpdateInput,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import type { JsonCache } from '../../utils/cache.js';
import { recordAudit } from '../audit/audit.service.js';
import { toImageView } from '../products/product.mapper.js';
import { Product, buildSearchTokens } from '../products/product.model.js';
import { Brand, type BrandAttrs } from './brand.model.js';

type BrandLean = BrandAttrs & { _id: Types.ObjectId };

const LIST_KEY = 'brands:list';

export function toBrandSummary(b: BrandLean): BrandSummary {
  return {
    id: b._id.toString(),
    name: b.name,
    slug: b.slug,
    logo: toImageView(b.logo, b.name),
    isFeatured: b.isFeatured,
  };
}

async function uniqueSlug(name: string): Promise<string> {
  const root = slugify(name) || 'brand';
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? root : `${root}-${String(n)}`;
    if (!(await Brand.exists({ slug: candidate }))) return candidate;
  }
  throw ApiError.conflict('Could not generate a unique slug');
}

/** Rewrites the denormalised brand name (and search tokens) on the brand's products. */
async function propagateBrandName(brandId: Types.ObjectId, name: string): Promise<void> {
  const cursor = Product.find({ brand: brandId }).select('name tags').lean().cursor();
  let batch: Parameters<typeof Product.bulkWrite>[0] = [];
  for await (const p of cursor) {
    batch.push({
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: { brandName: name, searchTokens: buildSearchTokens(p.name, name, p.tags) },
        },
      },
    });
    if (batch.length === 500) {
      await Product.bulkWrite(batch);
      batch = [];
    }
  }
  if (batch.length > 0) await Product.bulkWrite(batch);
}

export function createBrandService(cache: JsonCache) {
  return {
    list(): Promise<BrandSummary[]> {
      return cache.wrap(LIST_KEY, 300, async () => {
        const brands = await Brand.find({ isActive: true })
          .sort({ isFeatured: -1, name: 1 })
          .lean();
        return brands.map(toBrandSummary);
      });
    },

    async idsForSlugs(slugs: string[]): Promise<Types.ObjectId[]> {
      const brands = await Brand.find({ slug: { $in: slugs }, isActive: true })
        .select('_id')
        .lean();
      return brands.map((b) => b._id);
    },

    async create(req: Request, input: BrandInput): Promise<BrandSummary> {
      if (input.slug && (await Brand.exists({ slug: input.slug }))) {
        throw ApiError.conflict('Slug already in use');
      }
      const brand = await Brand.create({
        ...input,
        slug: input.slug ?? (await uniqueSlug(input.name)),
        logo: input.logo ?? null,
      });
      await recordAudit(req, {
        actorRole: 'ADMIN',
        action: 'brand.created',
        resource: 'BRAND',
        resourceId: brand._id.toString(),
        metadata: { name: brand.name },
      });
      await cache.invalidate(LIST_KEY);
      return toBrandSummary(brand.toObject());
    },

    async update(req: Request, id: string, input: BrandUpdateInput): Promise<BrandSummary> {
      const brand = await Brand.findById(id);
      if (!brand) throw ApiError.notFound('Brand not found');
      if (input.slug && input.slug !== brand.slug && (await Brand.exists({ slug: input.slug }))) {
        throw ApiError.conflict('Slug already in use');
      }
      const before = { name: brand.name, slug: brand.slug, isActive: brand.isActive };
      brand.set(input);
      await brand.save();
      if (brand.name !== before.name) await propagateBrandName(brand._id, brand.name);
      await recordAudit(req, {
        actorRole: 'ADMIN',
        action: 'brand.updated',
        resource: 'BRAND',
        resourceId: id,
        metadata: { before, changes: input },
      });
      await cache.invalidate(LIST_KEY);
      return toBrandSummary(brand.toObject());
    },

    async remove(req: Request, id: string): Promise<void> {
      const brand = await Brand.findById(id).lean();
      if (!brand) throw ApiError.notFound('Brand not found');
      if (await Product.exists({ brand: brand._id })) {
        throw ApiError.conflict('Products still use this brand — deactivate it instead');
      }
      await Brand.deleteOne({ _id: brand._id });
      await recordAudit(req, {
        actorRole: 'ADMIN',
        action: 'brand.deleted',
        resource: 'BRAND',
        resourceId: id,
        metadata: { name: brand.name },
      });
      await cache.invalidate(LIST_KEY);
    },
  };
}

export type BrandService = ReturnType<typeof createBrandService>;
