import type { Model } from 'mongoose';
import { models } from './models.js';

export interface IndexDiff {
  model: string;
  toCreate: string[];
  toDrop: string[];
}

function describeIndex(spec: unknown): string {
  if (typeof spec === 'string') return spec;
  const { key, options } = spec as { key?: Record<string, unknown>; options?: { name?: string } };
  return options?.name ?? JSON.stringify(key ?? spec);
}

/**
 * Compares schema-declared indexes with the database. With `apply`, creates missing
 * collections (transactions cannot create them implicitly on older servers) and runs
 * `syncIndexes`, which builds missing indexes and drops ones no longer declared.
 */
export async function syncAllIndexes({ apply }: { apply: boolean }): Promise<IndexDiff[]> {
  const diffs: IndexDiff[] = [];
  for (const [name, model] of Object.entries(models) as [string, Model<unknown>][]) {
    if (apply) {
      await model.createCollection().catch((error: unknown) => {
        // 48 = NamespaceExists — fine, the collection is already there.
        if ((error as { code?: number }).code !== 48) throw error;
      });
    }
    const diff = await model.diffIndexes();
    diffs.push({
      model: name,
      toCreate: diff.toCreate.map(describeIndex),
      toDrop: diff.toDrop.map(describeIndex),
    });
    if (apply && (diff.toCreate.length > 0 || diff.toDrop.length > 0)) {
      await model.syncIndexes();
    }
  }
  return diffs;
}
