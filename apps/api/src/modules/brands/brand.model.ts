import { PATTERNS } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { imageSchema } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

const brandSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    slug: { type: String, required: true, lowercase: true, match: PATTERNS.slug, maxlength: 70 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    logo: { type: imageSchema, default: null },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

brandSchema.index({ slug: 1 }, { unique: true });
// Case-insensitive uniqueness of the display name ("Voltra" vs "voltra").
brandSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 }, name: 'name_ci_unique' },
);
brandSchema.index({ isActive: 1, isFeatured: -1, name: 1 });

export type BrandAttrs = InferSchemaType<typeof brandSchema>;
export type BrandDocument = HydratedDocument<BrandAttrs>;
export const Brand = model('Brand', brandSchema);
