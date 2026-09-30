import {
  slugify,
  type GstRateBps,
  type VariantOptionKey,
  type VariantOptions,
} from '@zyventa/shared';
import type { Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { Brand } from '../../modules/brands/brand.model.js';
import { Category } from '../../modules/categories/category.model.js';
import { computeProductAggregates } from '../../modules/products/product-aggregates.js';
import { ProductVariant, buildOptionsKey } from '../../modules/products/product-variant.model.js';
import {
  PRODUCT_LIMITS,
  Product,
  buildSearchTokens,
} from '../../modules/products/product.model.js';
import {
  BRANDS,
  CATEGORY_TREE,
  type CategoryNode,
  type LeafTemplate,
  type SellerKey,
} from './catalog-data.js';
import type { Random } from './random.js';

interface CategoryRef {
  _id: Types.ObjectId;
  name: string;
  slug: string;
}

export interface CatalogSeedResult {
  categories: number;
  brands: number;
  products: number;
  variants: number;
  outOfStockVariants: number;
  categoryIdsBySlug: Map<string, Types.ObjectId>;
}

/** Round rupees to a retail-looking price ending in 9 (e.g. 1,299 or 249). */
function retailPrice(rupees: number): number {
  const step = rupees >= 10_000 ? 1000 : rupees >= 1000 ? 100 : 10;
  return Math.max(step - 1, Math.round(rupees / step) * step - 1);
}

function cartesian(axes: Partial<Record<VariantOptionKey, string[]>>): VariantOptions[] {
  const entries = Object.entries(axes) as [VariantOptionKey, string[]][];
  return entries.reduce<VariantOptions[]>(
    (combos, [key, values]) =>
      combos.flatMap((combo) => values.map((value) => ({ ...combo, [key]: value }))),
    [{}],
  );
}

function code(text: string, length: number): string {
  return text
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, length)
    .toUpperCase()
    .padEnd(length, 'X');
}

export async function seedCatalog(
  random: Random,
  sellerIds: Record<SellerKey, Types.ObjectId>,
): Promise<CatalogSeedResult> {
  // ── Brands ───────────────────────────────────────────────────────────────
  const brandDocs = await Brand.insertMany(
    BRANDS.map((name, index) => ({ name, slug: slugify(name), isFeatured: index < 8 })),
  );
  const brandByName = new Map<string, (typeof brandDocs)[number]>(
    brandDocs.map((b) => [b.name, b]),
  );

  // ── Categories + products (depth-first) ──────────────────────────────────
  const categoryIdsBySlug = new Map<string, Types.ObjectId>();
  const usedSlugs = new Set<string>();
  const products: Record<string, unknown>[] = [];
  const variants: Record<string, unknown>[] = [];
  let categoryCount = 0;
  let outOfStockVariants = 0;
  let productSeq = 0;

  const uniqueSlug = (base: string): string => {
    let slug = base;
    for (let n = 2; usedSlugs.has(slug); n += 1) slug = `${base}-${n}`;
    usedSlugs.add(slug);
    return slug;
  };

  const addProducts = (
    template: LeafTemplate,
    leaf: CategoryRef,
    categoryPath: Types.ObjectId[],
    rootSlug: string,
    gstRateBps: GstRateBps,
  ) => {
    template.names.forEach((name, index) => {
      productSeq += 1;
      const productId = new mongoose.Types.ObjectId();
      const brandName = template.brands.find((b) => name.startsWith(b)) ?? template.brands[0] ?? '';
      const brand = brandByName.get(brandName);
      const basePrice = random.int(template.price[0], template.price[1]);

      const combos = template.axes ? cartesian(template.axes) : [{}];
      const productVariants = combos.map((options, variantIndex) => {
        let rupees = basePrice;
        for (const [axis, step] of Object.entries(template.axisPriceStep ?? {}) as [
          VariantOptionKey,
          number,
        ][]) {
          const position = template.axes?.[axis]?.indexOf(options[axis] ?? '') ?? 0;
          rupees += Math.max(0, position) * step;
        }
        const price = retailPrice(rupees);
        const mrp = retailPrice(price * (1 + random.int(8, 45) / 100));
        const stock = random.chance(0.08) ? 0 : random.int(3, 60);
        if (stock === 0) outOfStockVariants += 1;
        return {
          _id: new mongoose.Types.ObjectId(),
          product: productId,
          seller: sellerIds[template.seller],
          sku: `${code(brandName, 3)}${code(leaf.name, 3)}-${String(productSeq).padStart(3, '0')}-${String(variantIndex + 1).padStart(2, '0')}`,
          options,
          optionsKey: buildOptionsKey(options),
          price: price * 100,
          mrp: Math.max(price, mrp) * 100,
          stock,
          reserved: 0,
          isDefault: variantIndex === 0,
          isActive: true,
        };
      });
      variants.push(...productVariants);

      const attributes = Object.entries(template.attributes ?? {}).flatMap(([key, values]) => {
        const value = values[index % values.length];
        return value ? [{ key, value }] : [];
      });

      const tags = [slugify(leaf.name), slugify(brandName)].slice(0, PRODUCT_LIMITS.tags);
      products.push({
        _id: productId,
        seller: sellerIds[template.seller],
        category: leaf._id,
        categoryPath,
        brand: brand?._id ?? null,
        brandName,
        name,
        slug: uniqueSlug(slugify(name)),
        shortDescription: `${name} — ${leaf.name.toLowerCase()} from ${brandName}.`,
        description: `<p>${name} is part of the ${brandName} ${leaf.name.toLowerCase()} range, built for everyday reliability.</p>`,
        highlights: [`Genuine ${brandName} product`, 'Sold and shipped by a verified seller'],
        specifications: (template.specs ?? []).map(([specName, value]) => ({
          group: 'General',
          name: specName,
          value,
        })),
        attributes,
        tags,
        searchTokens: buildSearchTokens(name, brandName, tags),
        images: [{ url: `/placeholders/${rootSlug}.svg`, alt: name }],
        variantOptions: Object.entries(template.axes ?? {}).map(([axis, values]) => ({
          name: axis,
          values,
        })),
        ...computeProductAggregates(productVariants),
        status: 'ACTIVE',
        isFeatured: random.chance(0.15),
        publishedAt: new Date(),
        gstRateBps: template.gstRateBps ?? gstRateBps,
        returnPolicy: {
          returnable: template.returnable ?? true,
          windowDays: template.returnable === false ? 0 : 7,
        },
      });
    });
  };

  const createNode = async (
    node: CategoryNode,
    ancestors: CategoryRef[],
    rootSlug: string | null,
    inheritedGst: GstRateBps,
    sortOrder: number,
  ) => {
    const slug = uniqueSlug(slugify(node.name));
    const gstRateBps = node.gstRateBps ?? inheritedGst;
    const category = await Category.create({
      name: node.name,
      slug,
      parent: ancestors.at(-1)?._id ?? null,
      ancestors,
      level: ancestors.length,
      icon: node.icon,
      gstRateBps,
      filterableAttributes: node.filterable ?? [],
      isFeatured: ancestors.length === 0,
      sortOrder,
    });
    categoryCount += 1;
    categoryIdsBySlug.set(slug, category._id);
    const self: CategoryRef = { _id: category._id, name: category.name, slug };
    const root = rootSlug ?? slug;

    if (node.products) {
      addProducts(
        node.products,
        self,
        [...ancestors.map((a) => a._id), category._id],
        root,
        gstRateBps,
      );
    }
    for (const [index, child] of (node.children ?? []).entries()) {
      await createNode(child, [...ancestors, self], root, gstRateBps, index);
    }
  };

  for (const [index, root] of CATEGORY_TREE.entries()) {
    await createNode(root, [], null, root.gstRateBps ?? 1800, index);
  }

  await Product.insertMany(products);
  await ProductVariant.insertMany(variants);

  return {
    categories: categoryCount,
    brands: brandDocs.length,
    products: products.length,
    variants: variants.length,
    outOfStockVariants,
    categoryIdsBySlug,
  };
}
