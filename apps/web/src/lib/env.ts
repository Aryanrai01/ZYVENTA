import { z } from 'zod';

/**
 * Public (browser-visible) configuration. NEXT_PUBLIC_* values are inlined at build time, so
 * each must be referenced literally below. NEVER put a secret in a NEXT_PUBLIC_* variable.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || undefined,
});

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid web environment configuration — ${details}. See apps/web/.env.example`);
}

export const publicEnv = parsed.data;

const API_PREFIX = '/api/v1';

/**
 * Base URL for API calls. Server-side rendering inside Docker reaches the API over the
 * internal network (API_INTERNAL_URL, e.g. http://api:4000/api/v1); browsers use the public URL.
 * API_INTERNAL_URL is not a secret — it is simply unused (undefined) in browser bundles.
 */
export function apiBaseUrl(): string {
  if (typeof window !== 'undefined') return `${window.location.origin}${API_PREFIX}`;

  const base = process.env.API_INTERNAL_URL || publicEnv.NEXT_PUBLIC_API_URL; // `||`: empty string = unset
  const normalized = base.replace(/\/+$/, '');
  return normalized.endsWith(API_PREFIX) ? normalized : `${normalized}${API_PREFIX}`;
}
