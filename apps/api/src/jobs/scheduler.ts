import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger.js';
import { JobLock } from './job-lock.model.js';

export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

/** In-process interval jobs use MongoDB leases so multiple API replicas do not run a job at once. */
export function startJobs(jobs: Job[]): () => void {
  const timers: NodeJS.Timeout[] = [];
  const owner = randomUUID();

  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      let locked = false;
      try {
        locked = await acquireLock(job.name, owner, Math.max(job.intervalMs, 60_000));
        if (!locked) return;
        await job.run();
      } catch (error) {
        logger.error({ job: job.name, reason: String(error) }, 'Background job failed');
      } finally {
        if (locked) {
          await JobLock.deleteOne({ name: job.name, owner }).catch((error: unknown) => {
            logger.warn(
              { job: job.name, reason: String(error) },
              'Background job lock release failed',
            );
          });
        }
        running = false;
      }
    };
    const timer = setInterval(() => void tick(), job.intervalMs);
    timer.unref();
    timers.push(timer);
  }
  logger.info({ jobs: jobs.map((j) => j.name) }, 'Background jobs started');
  return () => {
    timers.forEach(clearInterval);
  };
}

async function acquireLock(name: string, owner: string, leaseMs: number): Promise<boolean> {
  const now = new Date();
  try {
    const lock = await JobLock.findOneAndUpdate(
      { name, $or: [{ expiresAt: { $lte: now } }, { owner }] },
      { $set: { owner, expiresAt: new Date(now.getTime() + leaseMs) } },
      { new: true, upsert: true },
    ).lean();
    return lock.owner === owner;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}
