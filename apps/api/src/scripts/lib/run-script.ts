import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { env } from '../../config/env.js';

/**
 * Wraps a CLI script: connects to MongoDB, runs `main`, always disconnects, and sets the exit
 * code. Scripts print human-readable output with console (allowed in src/scripts only).
 */
export function runScript(name: string, main: (args: string[]) => Promise<void>): void {
  const started = Date.now();
  void (async () => {
    try {
      await connectDatabase(env.MONGODB_URI);
      await main(process.argv.slice(2));
      console.log(`\n✔ ${name} finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      process.exitCode = 0;
    } catch (error) {
      console.error(`\n✖ ${name} failed:`, error instanceof Error ? error.message : error);
      process.exitCode = 1;
    } finally {
      await disconnectDatabase().catch(() => undefined);
    }
  })();
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}
