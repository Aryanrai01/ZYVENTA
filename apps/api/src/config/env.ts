import { z } from 'zod';

/**
 * Environment contract for the API. Validated once at boot: a missing or malformed value
 * crashes the process immediately instead of failing later at request time.
 *
 * Variables for later phases (Razorpay, Cloudinary) are added to this schema in the phase
 * that first uses them, so the app never demands a secret it does not need yet.
 */
const commaSeparatedUrls = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1));

/** Secrets must be long random strings; placeholders and short values are rejected. */
function secret(name: string) {
  return z
    .string({ error: `${name} is required (generate with: openssl rand -base64 64)` })
    .min(32, `${name} must be at least 32 characters (generate with: openssl rand -base64 64)`)
    .refine((v) => !/change|placeholder|secret|example/i.test(v), {
      message: `${name} looks like a placeholder — generate a random value`,
    });
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'staging', 'production']).optional(),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    APP_VERSION: z.string().default('0.1.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** `pretty` needs the pino-pretty dev dependency; containers and production use `json`. */
    LOG_FORMAT: z.enum(['json', 'pretty']).optional(),

    /** Browser origins allowed to call the API with credentials (comma-separated). */
    CORS_ORIGINS: commaSeparatedUrls,
    /** Number of reverse-proxy hops in front of the API (load balancer, ingress). 0 = none. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must start with mongodb:// or mongodb+srv://'),

    /** Global per-IP request budget per minute (auth/checkout get stricter limits later). */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).default(300),

    // ── Auth (Phase 4) ──────────────────────────────────────────────────────
    /** HS256 key for access-token JWTs. Generate: openssl rand -base64 64 */
    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    /**
     * HMAC key for hashing opaque tokens (refresh, email verification, password reset) and
     * signing CSRF tokens. A database leak alone then yields nothing usable.
     */
    TOKEN_HASH_SECRET: secret('TOKEN_HASH_SECRET'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Parent domain for cookies in production, e.g. `.zyventa.com`. Unset = host-only. */
    COOKIE_DOMAIN: z
      .string()
      .regex(/^\.?[a-z0-9.-]+$/i, 'COOKIE_DOMAIN must be a bare domain like .zyventa.com')
      .optional(),
    /** Public web app URL — used to build links in emails. */
    WEB_APP_URL: z
      .url()
      .default('http://localhost:3000')
      .transform((u) => u.replace(/\/$/, '')),

    // ── Email ───────────────────────────────────────────────────────────────
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().min(3).default('ZYVENTA <no-reply@zyventa.local>'),

    // ── Image storage (Phase 5) — optional: uploads return 503 until configured ──
    CLOUDINARY_CLOUD_NAME: z
      .string()
      .regex(/^[a-z0-9_-]+$/i)
      .optional(),
    CLOUDINARY_API_KEY: z.string().min(5).optional(),
    CLOUDINARY_API_SECRET: z.string().min(10).optional(),
    /** Root folder for uploaded assets inside the Cloudinary account. */
    CLOUDINARY_FOLDER: z
      .string()
      .regex(/^[a-z0-9_-]+$/)
      .default('zyventa'),

    // ── Seller payout encryption (Phase 7) — optional until sellers add bank details ──
    /** 32 random bytes, base64. Generate: openssl rand -base64 32 */
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, {
        message: 'DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)',
      })
      .optional(),

    // ── Razorpay (Phase 8) — optional in development; checkout returns 503 until set ──
    RAZORPAY_KEY_ID: z
      .string()
      .regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, 'RAZORPAY_KEY_ID looks like rzp_test_…')
      .optional(),
    RAZORPAY_KEY_SECRET: z.string().min(10).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(8).optional(),
    RAZORPAY_API_URL: z.url().default('https://api.razorpay.com/v1'),

    // ── Background jobs ─────────────────────────────────────────────────────
    /** Disable in-process jobs (e.g. when running a dedicated worker). */
    JOBS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.TOKEN_HASH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOKEN_HASH_SECRET'],
        message: 'TOKEN_HASH_SECRET must differ from JWT_ACCESS_SECRET',
      });
    }
    const cloudinary = [
      env.CLOUDINARY_CLOUD_NAME,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
    ];
    if (cloudinary.some(Boolean) && !cloudinary.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['CLOUDINARY_CLOUD_NAME'],
        message:
          'Set all of CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET, or none',
      });
    }
    if (Boolean(env.RAZORPAY_KEY_ID) !== Boolean(env.RAZORPAY_KEY_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message: 'Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither',
      });
    }
    const appEnv = env.APP_ENV ?? (env.NODE_ENV === 'production' ? 'production' : 'development');
    // Staging intentionally uses Razorpay test mode; production requires live mode.
    if (appEnv === 'production' && !env.RAZORPAY_KEY_ID?.startsWith('rzp_live_')) {
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message: 'Use live Razorpay keys in production',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    if (!env.WEB_APP_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_APP_URL'],
        message: 'Must use https in production',
      });
    }
    for (const origin of env.CORS_ORIGINS) {
      if (!origin.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `Production CORS origins must use https (got ${origin})`,
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    APP_ENV: env.APP_ENV ?? (env.NODE_ENV === 'production' ? 'production' : 'development'),
    LOG_FORMAT: env.LOG_FORMAT ?? (env.NODE_ENV === 'development' ? 'pretty' : 'json'),
  }));

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  // `KEY=` lines in .env files arrive as empty strings; treat them as unset so defaults apply.
  const defined = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(defined);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
