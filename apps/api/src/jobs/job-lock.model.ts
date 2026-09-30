import { Schema, model } from '../database/mongoose.js';

const jobLockSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

jobLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const JobLock = model('JobLock', jobLockSchema);
