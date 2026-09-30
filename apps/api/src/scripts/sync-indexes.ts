/**
 * Usage:
 *   pnpm --filter @zyventa/api db:sync-indexes            # dry run: show differences
 *   pnpm --filter @zyventa/api db:sync-indexes --apply    # create missing / drop stale indexes
 *
 * Run with --apply as a deploy step (production has autoIndex disabled).
 */
import { syncAllIndexes } from '../database/sync-indexes.js';
import { hasFlag, runScript } from './lib/run-script.js';

runScript('sync-indexes', async (args) => {
  const apply = hasFlag(args, '--apply');
  const diffs = await syncAllIndexes({ apply });

  let changes = 0;
  for (const { model, toCreate, toDrop } of diffs) {
    if (toCreate.length === 0 && toDrop.length === 0) continue;
    changes += toCreate.length + toDrop.length;
    console.log(`\n${model}`);
    for (const index of toCreate) console.log(`  + ${index}`);
    for (const index of toDrop) console.log(`  - ${index}`);
  }

  if (changes === 0) {
    console.log('All indexes are in sync.');
  } else if (!apply) {
    console.log(`\n${changes} index change(s) pending. Re-run with --apply to execute.`);
  } else {
    console.log(`\nApplied ${changes} index change(s).`);
  }
});
