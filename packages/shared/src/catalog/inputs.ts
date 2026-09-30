import { z } from 'zod';
import { GST_RATES_BPS } from '../constants/india.js';
import { VARIANT_OPTION_KEYS } from '../constants/statuses.js';
import { PATTERNS, objectIdSchema, slugSchema } from '../validation/fields.js';

/** Price inputs are integer paise ≥ ₹1 (the UI converts from rupees). */
/** One of the supported GST slabs, in basis points. */
export const gstRateSchema = z.literal(GST_RATES_BPS, { error: 'Unsupported GST rate' });

const pricePaise = z
  .number()
  .int('Use whole paise')
  .min(100, 'Minimum price is ₹1')
  .max(1_000_000_000);
const stock = z.number().int().min(0).max(1_000_000);
const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PATTERNS.sku, 'SKU: 3–64 of A–Z, 0–9, - or _');

export const productImageInputSchema = z
  .object({
    url: z.string().trim().max(2048).regex(PATTERNS.imageUrl, 'Invalid image URL'),
    publicId: z.string().trim().max(255).optional(),
    alt: z.string().trim().max(200).optional(),
    width: z.number().int().min(1).max(10_000).optional(),
    height: z.number().int().min(1).max(10_000).optional(),
  })
  .strict();

const variantOptionsSchema = z
  .object(
    Object.fromEntries(
      VARIANT_OPTION_KEYS.map((k) => [k, z.string().trim().min(1).max(40).optional()]),
    ) as Record<(typeof VARIANT_OPTION_KEYS)[number], z.ZodOptional<z.ZodString>>,
  )
  .strict();

export const variantInputSchema = z
  .object({
    sku: skuSchema,
    options: variantOptionsSchema.default({}),
    price: pricePaise,
    mrp: pricePaise,
    stock: stock.default(0),
    lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
    images: z.array(productImageInputSchema).max(8).default([]),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.price <= v.mrp, { path: ['price'], message: 'Selling price cannot exceed MRP' });
export type VariantInput = z.infer<typeof variantInputSchema>;

export const variantUpdateSchema = z
  .object({
    sku: skuSchema.optional(),
    price: pricePaise.optional(),
    mrp: pricePaise.optional(),
    lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
    images: z.array(productImageInputSchema).max(8).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;

const productFields = {
  name: z.string().trim().min(3).max(200),
  categoryId: objectIdSchema,
  brandId: objectIdSchema.nullable().optional(),
  shortDescription: z.string().trim().max(300).default(''),
  /** HTML — sanitised server-side against an allowlist. */
  description: z.string().max(20_000).default(''),
  highlights: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  specifications: z
    .array(
      z
        .object({
          group: z.string().trim().max(60).default('General'),
          name: z.string().trim().min(1).max(80),
          value: z.string().trim().min(1).max(300),
        })
        .strict(),
    )
    .max(100)
    .default([]),
  attributes: z
    .array(
      z
        .object({
          key: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z][a-z0-9_]{1,39}$/),
          value: z.string().trim().min(1).max(60),
        })
        .strict(),
    )
    .max(50)
    .default([]),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
  images: z.array(productImageInputSchema).max(10).default([]),
  variantOptions: z
    .array(
      z
        .object({
          name: z.enum(VARIANT_OPTION_KEYS),
          values: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
        })
        .strict(),
    )
    .max(3)
    .default([]),
  hsnCode: z.string().trim().regex(PATTERNS.hsn).nullable().optional(),
  gstRateBps: gstRateSchema.nullable().optional(),
  returnPolicy: z
    .object({ returnable: z.boolean(), windowDays: z.number().int().min(0).max(30) })
    .strict()
    .default({ returnable: true, windowDays: 7 }),
  warranty: z.string().trim().max(200).default(''),
  shipping: z
    .object({
      weightGrams: z.number().int().min(1).max(100_000).optional(),
      lengthCm: z.number().min(1).max(500).optional(),
      widthCm: z.number().min(1).max(500).optional(),
      heightCm: z.number().min(1).max(500).optional(),
    })
    .strict()
    .default({}),
  seo: z
    .object({
      title: z.string().trim().max(70).optional(),
      description: z.string().trim().max(170).optional(),
    })
    .strict()
    .default({}),
};

/** Sellers may only move between these; BLOCKED/ARCHIVED are set by admin/delete. */
export const SELLER_SETTABLE_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;

export const createProductSchema = z
  .object({
    ...productFields,
    status: z.enum(SELLER_SETTABLE_STATUSES).default('DRAFT'),
    variants: z.array(variantInputSchema).min(1).max(100),
  })
  .strict();
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: productFields.name.optional(),
    categoryId: productFields.categoryId.optional(),
    brandId: productFields.brandId,
    shortDescription: z.string().trim().max(300).optional(),
    description: z.string().max(20_000).optional(),
    highlights: productFields.highlights.unwrap().optional(),
    specifications: productFields.specifications.unwrap().optional(),
    attributes: productFields.attributes.unwrap().optional(),
    tags: productFields.tags.unwrap().optional(),
    images: productFields.images.unwrap().optional(),
    hsnCode: productFields.hsnCode,
    gstRateBps: productFields.gstRateBps,
    returnPolicy: productFields.returnPolicy.unwrap().optional(),
    warranty: z.string().trim().max(200).optional(),
    shipping: productFields.shipping.unwrap().optional(),
    seo: productFields.seo.unwrap().optional(),
    status: z.enum(SELLER_SETTABLE_STATUSES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** Set an absolute stock level, or adjust relative to the current one (receiving/shrinkage). */
export const stockUpdateSchema = z.union([
  z.object({ stock }).strict(),
  z
    .object({
      adjustBy: z
        .number()
        .int()
        .min(-1_000_000)
        .max(1_000_000)
        .refine((v) => v !== 0),
    })
    .strict(),
]);
export type StockUpdateInput = z.infer<typeof stockUpdateSchema>;

export const idParamSchema = z.object({ id: objectIdSchema }).strict();
export const productVariantParamSchema = z
  .object({ id: objectIdSchema, variantId: objectIdSchema })
  .strict();
export const variantIdParamSchema = z.object({ variantId: objectIdSchema }).strict();
export const slugParamSchema = z.object({ slug: slugSchema }).strict();

// ── Admin catalogue management ─────────────────────────────────────────────

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: slugSchema.optional(),
    parentId: objectIdSchema.nullable().default(null),
    description: z.string().trim().max(1000).default(''),
    icon: z.string().trim().max(40).optional(),
    image: productImageInputSchema.nullable().optional(),
    gstRateBps: gstRateSchema.default(1800),
    filterableAttributes: z
      .array(
        z
          .object({
            key: z
              .string()
              .trim()
              .toLowerCase()
              .regex(/^[a-z][a-z0-9_]{1,39}$/),
            label: z.string().trim().min(1).max(60),
            values: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    seo: z
      .object({
        title: z.string().trim().max(70).optional(),
        description: z.string().trim().max(170).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export const categoryUpdateSchema = categoryInputSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export const brandInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    slug: slugSchema.optional(),
    description: z.string().trim().max(1000).default(''),
    logo: productImageInputSchema.nullable().optional(),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
  })
  .strict();
export type BrandInput = z.infer<typeof brandInputSchema>;
export const brandUpdateSchema = brandInputSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type BrandUpdateInput = z.infer<typeof brandUpdateSchema>;

export const imageDeleteSchema = z.object({ publicId: z.string().trim().min(1).max(255) }).strict();
