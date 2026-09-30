import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    // Integration tests share one in-memory MongoDB replica set per file.
    hookTimeout: 120_000,
    testTimeout: 20_000,
    pool: 'forks',
  },
});
