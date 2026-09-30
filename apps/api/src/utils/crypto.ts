import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const VERSION = 'v1';

function key(): Buffer {
  if (!env.DATA_ENCRYPTION_KEY) {
    throw ApiError.serviceUnavailable(
      'Secure storage is not configured. Set DATA_ENCRYPTION_KEY in apps/api/.env',
    );
  }
  return Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');
}

/**
 * AES-256-GCM with a random 96-bit IV per value. Output: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 * GCM authenticates the ciphertext, so tampering is detected on decrypt.
 */
export function encryptField(plaintext: string, aad = ''): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decryptField(payload: string, aad = ''): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Malformed encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Hex HMAC-SHA256. */
export function hmacSha256Hex(secret: string, message: string | Buffer): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function safeHexEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
