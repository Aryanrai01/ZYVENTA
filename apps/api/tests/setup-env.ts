// Runs before every test file (vitest `setupFiles`), i.e. before `config/env.ts` is imported.
// Only non-secret placeholders: tests never talk to real external services.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/zyventa_test';
process.env.RATE_LIMIT_PER_MINUTE = '1000';
// Test-only random-looking secrets (never used outside the test process).
process.env.JWT_ACCESS_SECRET = 'test-jwt-access-key-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.TOKEN_HASH_SECRET = 'test-token-hash-key-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.WEB_APP_URL = 'http://localhost:3000';
