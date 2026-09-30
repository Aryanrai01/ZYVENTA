import { GST_RATES_BPS, PATTERNS } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { imageSchema, maxItems, seoSchema, uniqueBy } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

export const MAX_CATEGORY_DEPTH = 3; // 0 = root … 3 = deepest leaf

/** Denormalised ancestor chain for breadcrumbs and subtree queries without recursion. */
const ancestorSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
  },
  { _id: false },
);

/**
 * Facets shoppers can filter on inside this category (e.g. "Screen size" for TVs).
 * Product attribute values are matched against these keys.
 */
const filterableAttributeSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-z][a-z0-9_]{1,39}$/,
    },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    values: {
      type: [{ type: String, trim: true, maxlength: 60 }],
      default: [],
      validate: maxItems(100, 'values'),
    },
  },
  { _id: false },
);

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, match: PATTERNS.slug, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    ancestors: { type: [ancestorSchema], default: [] },
    level: { type: Number, min: 0, max: MAX_CATEGORY_DEPTH, default: 0 },
    image: { type: imageSchema, default: null },
    icon: { type: String, trim: true, maxlength: 40 }, // lucide icon name
    /** Default GST rate for products in this category (products may override). */
    gstRateBps: { type: Number, enum: GST_RATES_BPS, default: 1800 },
    filterableAttributes: {
      type: [filterableAttributeSchema],
      default: [],
      validate: [
        maxItems(20, 'filterable attributes'),
        uniqueBy((a: { key: string }) => a.key, 'Attribute keys must be unique'),
      ],
    },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    seo: { type: seoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

categorySchema.pre('validate', function () {
  if (this.parent && this.parent.equals(this._id)) {
    this.invalidate('parent', 'A category cannot be its own parent');
  }
  if (this.ancestors.length !== this.level) {
    this.invalidate('level', 'Level must equal the number of ancestors');
  }
});

categorySchema.index({ slug: 1 }, { unique: true });
// Menu rendering: children of a parent in display order.
categorySchema.index({ parent: 1, isActive: 1, sortOrder: 1 });
// Subtree lookups ("all categories under Electronics").
categorySchema.index({ 'ancestors._id': 1 });
categorySchema.index({ isFeatured: 1, isActive: 1, sortOrder: 1 });

export type CategoryAttrs = InferSchemaType<typeof categorySchema>;
export type CategoryDocument = HydratedDocument<CategoryAttrs>;
export const Category = model('Category', categorySchema);
