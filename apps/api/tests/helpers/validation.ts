import { mongoose } from '../../src/database/mongoose.js';

/**
 * Runs Mongoose validation (no database needed) and returns the failing paths.
 * An empty array means the document is valid.
 */
export async function invalidPaths(doc: mongoose.Document): Promise<string[]> {
  try {
    await doc.validate();
    return [];
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return Object.keys(error.errors).sort();
    }
    throw error;
  }
}

export const oid = () => new mongoose.Types.ObjectId();
