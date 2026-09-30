import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { mongoose } from '../src/database/mongoose.js';
import { Brand } from '../src/modules/brands/brand.model.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Coupon } from '../src/modules/coupons/coupon.model.js';
import { Offer } from '../src/modules/offers/offer.model.js';
import { ProductVariant } from '../src/modules/products/product-variant.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Seller } from '../src/modules/sellers/seller.model.js';
import { PlatformSetting } from '../src/modules/settings/platform-setting.model.js';
import { Address } from '../src/modules/users/address.model.js';
import { User } from '../src/modules/users/user.model.js';
import { seedCatalog } from '../src/scripts/seed/seed-catalog.js';
import { seedPeople } from '../src/scripts/seed/seed-people.js';
import { seedPromotions } from '../src/scripts/seed/seed-promotions.js';
import { createRandom } from '../src/scripts/seed/random.js';

/*
 * Runs the real seed code with persistence replaced by schema validation. Catches invalid
 * seed data (bad enums, arithmetic, regexes) without needing a MongoDB server; uniqueness
 * and index behaviour are covered by tests/integration.
 */
type AnyModel = mongoose.Model<any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- spies wrap heterogeneous models

const saved = new Map<string, mongoose.Document[]>();
const failures: string[] = [];

async function validateInto(model: AnyModel, raw: unknown): Promise<mongoose.Document> {
  const doc = new model(raw) as mongoose.Document;
  try {
    await doc.validate();
  } catch (error) {
    failures.push(`${model.modelName}: ${(error as Error).message}`);
  }
  const list = saved.get(model.modelName) ?? [];
  list.push(doc);
  saved.set(model.modelName, list);
  return doc;
}

function stubPersistence(model: AnyModel) {
  vi.spyOn(model, 'create').mockImplementation((async (raw: unknown) =>
    validateInto(model, raw)) as never);
  vi.spyOn(model, 'insertMany').mockImplementation((async (raws: unknown[]) =>
    Promise.all(raws.map((raw) => validateInto(model, raw)))) as never);
}

describe('seed dry run (schema validation of all generated data)', () => {
  beforeAll(async () => {
    for (const model of [
      User,
      Address,
      Seller,
      Brand,
      Category,
      Product,
      ProductVariant,
      Coupon,
      Offer,
      PlatformSetting,
    ]) {
      stubPersistence(model as AnyModel);
    }
    const people = await seedPeople('$argon2id$v=19$m=19456,t=2,p=1$placeholder$placeholder');
    const catalog = await seedCatalog(createRandom(1), people.sellerIds);
    await seedPromotions({
      adminId: people.adminId,
      sellerIds: people.sellerIds,
      electronicsCategoryId: catalog.categoryIdsBySlug.get('electronics'),
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('produces only schema-valid documents', () => {
    expect(failures).toEqual([]);
  });

  it('creates the expected volume of data', () => {
    expect(saved.get('Product')?.length).toBeGreaterThan(80);
    expect(saved.get('ProductVariant')?.length).toBeGreaterThan(200);
    expect(saved.get('Seller')).toHaveLength(4);
    expect(saved.get('Coupon')?.length).toBeGreaterThanOrEqual(3);
  });

  it('generates unique SKUs, slugs and option combinations', () => {
    const variants = saved.get('ProductVariant') ?? [];
    const skus = variants.map((v) => v.get('sku') as string);
    expect(new Set(skus).size).toBe(skus.length);
    const combos = variants.map(
      (v) => `${String(v.get('product'))}:${String(v.get('optionsKey'))}`,
    );
    expect(new Set(combos).size).toBe(combos.length);
    const slugs = [...(saved.get('Product') ?? []), ...(saved.get('Category') ?? [])].map(
      (d) => d.get('slug') as string,
    );
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('includes some out-of-stock variants for the stock-alert flow', () => {
    const variants = saved.get('ProductVariant') ?? [];
    expect(variants.some((v) => v.get('stock') === 0)).toBe(true);
  });

  it('references placeholder images that exist in the web app', async () => {
    const { existsSync } = await import('node:fs');
    const urls = new Set(
      (saved.get('Product') ?? []).flatMap((p) =>
        (p.get('images') as { url: string }[]).map((i) => i.url),
      ),
    );
    for (const url of urls) {
      expect(existsSync(new URL(`../../web/public${url}`, import.meta.url))).toBe(true);
    }
  });
});
