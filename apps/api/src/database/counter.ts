import type { ClientSession } from 'mongoose';
import { Schema, model } from './mongoose.js';

/**
 * Atomic sequences (`findOneAndUpdate` + `$inc` + upsert). Used for human-readable order
 * numbers, which must be unique and short — ObjectIds are neither memorable nor speakable.
 */
const counterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export const Counter = model('Counter', counterSchema);

export async function nextSequence(name: string, session?: ClientSession): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session: session ?? null },
  ).lean();
  return counter.seq; // upsert + new: always returns the document
}

/**
 * `ZV<yy><mm>-<seq>` e.g. ZV2609-000123. The sequence is global (not reset monthly), so
 * numbers stay unique even though the prefix is date-based; the prefix aids support triage.
 */
export function formatOrderNumber(sequence: number, date: Date = new Date()): string {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `ZV${yy}${mm}-${String(sequence).padStart(6, '0')}`;
}

export async function nextOrderNumber(session?: ClientSession): Promise<string> {
  return formatOrderNumber(await nextSequence('order', session));
}
