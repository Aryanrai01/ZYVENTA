import { mongoose } from '../../database/mongoose.js';
import { syncAllIndexes } from '../../database/sync-indexes.js';
import { hashPassword } from '../../modules/auth/password.js';
import { Category } from '../../modules/categories/category.model.js';
import { seedCatalog, type CatalogSeedResult } from './seed-catalog.js';
import { seedPeople, type PeopleSeedResult } from './seed-people.js';
import { seedPromotions } from './seed-promotions.js';
import { createRandom } from './random.js';

export interface SeedOptions {
  /** Drop the whole database first (development only). */
  reset: boolean;
  /** Password for every demo account. */
  password: string;
  /** PRNG seed — same value, same data. */
  randomSeed?: number;
}

export interface SeedSummary {
  catalog: Omit<CatalogSeedResult, 'categoryIdsBySlug'>;
  coupons: number;
  offers: number;
  logins: PeopleSeedResult['logins'];
}

export async function runSeed(options: SeedOptions): Promise<SeedSummary> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production');
  }
  const dbName = mongoose.connection.name;
  if (/prod/i.test(dbName)) {
    throw new Error(`Refusing to seed database "${dbName}" (name looks like production)`);
  }

  if (options.reset) {
    await mongoose.connection.dropDatabase();
  } else if ((await Category.estimatedDocumentCount()) > 0) {
    throw new Error('Database already has data. Re-run with --reset to wipe and reseed.');
  }

  // Build collections + unique indexes BEFORE inserting so constraints apply to seed data.
  await syncAllIndexes({ apply: true });

  const random = createRandom(options.randomSeed ?? 20_260_927);
  const passwordHash = await hashPassword(options.password);

  const people = await seedPeople(passwordHash);
  const { categoryIdsBySlug, ...catalog } = await seedCatalog(random, people.sellerIds);
  const promotions = await seedPromotions({
    adminId: people.adminId,
    sellerIds: people.sellerIds,
    electronicsCategoryId: categoryIdsBySlug.get('electronics'),
  });

  return { catalog, ...promotions, logins: people.logins };
}
