import mongoose from 'mongoose';

/*
 * The one configured Mongoose instance. Every model imports `mongoose` from HERE (never from
 * 'mongoose' directly) so these global settings are guaranteed to apply before any schema is
 * compiled — including in tests and scripts that never call connectDatabase().
 *
 *  - strictQuery: filter keys not in the schema are dropped instead of silently matching.
 *  - NoSQL-injection defence is at the HTTP edge (middleware/rejectOperatorKeys.ts + strict
 *    zod schemas), not `sanitizeFilter` — see that middleware for the reasoning.
 *  - autoIndex off in production: indexes are built by `pnpm db:sync-indexes` during deploys,
 *    not implicitly on every cold start.
 *  - toJSON/toObject: expose `id`, hide `_id` and `__v`. Fields marked `select: false`
 *    (password hashes, token hashes, encrypted payout data) are never loaded by default.
 */
mongoose.set('strictQuery', true);
mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');
mongoose.set('autoCreate', process.env.NODE_ENV !== 'production');

const serializeOptions = {
  virtuals: true,
  versionKey: false,
  transform(_doc: unknown, ret: Record<string, unknown>) {
    delete ret._id;
    return ret;
  },
};
mongoose.set('toJSON', serializeOptions);
mongoose.set('toObject', { virtuals: true, versionKey: false });

/**
 * Schema-level toJSON options that additionally strip sensitive paths (dot paths allowed).
 * Defence in depth: services map documents to DTOs anyway, but an accidental
 * `res.json(user)` must still never leak a password hash or token hash.
 */
export function toJSONWithout(...paths: string[]) {
  return {
    virtuals: true,
    versionKey: false,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      delete ret._id;
      for (const path of paths) {
        const segments = path.split('.');
        const leaf = segments.pop();
        let target: unknown = ret;
        for (const segment of segments) {
          target = (target as Record<string, unknown> | undefined)?.[segment];
        }
        if (leaf && target && typeof target === 'object') {
          Reflect.deleteProperty(target, leaf);
        }
      }
      return ret;
    },
  };
}

export { mongoose };
export const { Schema, model, Types } = mongoose;
