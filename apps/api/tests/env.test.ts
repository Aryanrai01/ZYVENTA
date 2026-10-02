import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const base = {
  JWT_ACCESS_SECRET: 'a1'.repeat(20),
  TOKEN_HASH_SECRET: 'b2'.repeat(20),
  CORS_ORIGINS: 'http://localhost:3000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/zyventa',
};

describe('parseEnv', () => {
  it('applies defaults and splits CORS origins', () => {
    const env = parseEnv({
      ...base,
      CORS_ORIGINS: 'http://localhost:3000/, http://127.0.0.1:3000',
    });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
  });

  it('treats empty values as unset', () => {
    const env = parseEnv({ ...base, LOG_FORMAT: '', PORT: '' });
    expect(env.PORT).toBe(4000);
    expect(env.LOG_FORMAT).toBe('pretty');
    expect(parseEnv({ ...base, NODE_ENV: 'test' }).LOG_FORMAT).toBe('json');
  });

  it('fails fast listing every missing variable', () => {
    expect(() => parseEnv({})).toThrow(/MONGODB_URI/);
  });

  it('rejects malformed connection strings', () => {
    expect(() => parseEnv({ ...base, MONGODB_URI: 'postgres://x' })).toThrow(/MONGODB_URI/);
  });

  it('requires https origins and links in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/https/);
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://www.zyventa.com',
        WEB_APP_URL: 'https://www.zyventa.com',
        RAZORPAY_KEY_ID: 'rzp_live_abc123',
        RAZORPAY_KEY_SECRET: 'live_secret_123',
      }),
    ).not.toThrow();
  });

  it('allows Razorpay test keys in staging even when NODE_ENV is production', () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: 'production',
      APP_ENV: 'staging',
      CORS_ORIGINS: 'https://www.zyventa.com',
      WEB_APP_URL: 'https://www.zyventa.com',
      RAZORPAY_KEY_ID: 'rzp_test_abc123',
      RAZORPAY_KEY_SECRET: 'test_secret_123',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.APP_ENV).toBe('staging');
  });

  it('requires live Razorpay keys in the production app environment', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        APP_ENV: 'production',
        CORS_ORIGINS: 'https://www.zyventa.com',
        WEB_APP_URL: 'https://www.zyventa.com',
        RAZORPAY_KEY_ID: 'rzp_test_abc123',
        RAZORPAY_KEY_SECRET: 'test_secret_123',
      }),
    ).toThrow('RAZORPAY_KEY_ID: Use live Razorpay keys in production');
  });

  it('rejects short, placeholder or reused secrets', () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/32 characters/);
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: 'change-me-'.repeat(4) })).toThrow(
      /placeholder/,
    );
    expect(() => parseEnv({ ...base, TOKEN_HASH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /differ/,
    );
  });
});
