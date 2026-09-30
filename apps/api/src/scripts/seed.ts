/**
 * Loads fictional demo data (development only).
 *
 *   pnpm db:seed            # into an empty database
 *   pnpm db:seed --reset    # DROP the database, then seed
 *
 * Every demo account uses SEED_USER_PASSWORD (default below). Emails use the reserved
 * `.test` TLD, so nothing can ever be emailed to a real inbox.
 */
import { passwordSchema } from '@zyventa/shared';
import { hasFlag, runScript } from './lib/run-script.js';
import { runSeed } from './seed/run-seed.js';

const DEFAULT_DEV_PASSWORD = 'Zyventa@dev2026';

runScript('seed', async (args) => {
  const password = passwordSchema.parse(process.env.SEED_USER_PASSWORD ?? DEFAULT_DEV_PASSWORD);
  const summary = await runSeed({ reset: hasFlag(args, '--reset'), password });

  console.log('\nSeeded:');
  console.table({ ...summary.catalog, coupons: summary.coupons, offers: summary.offers });
  console.log(
    `\nDemo logins (password: ${process.env.SEED_USER_PASSWORD ? '$SEED_USER_PASSWORD' : DEFAULT_DEV_PASSWORD}):`,
  );
  console.table(summary.logins);
});
