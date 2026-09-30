import argon2 from 'argon2';

/**
 * Argon2id with the OWASP Password Storage Cheat Sheet baseline (m = 19 MiB, t = 2, p = 1).
 * Parameters are embedded in each hash, so they can be raised later: `needsRehash` flags
 * old hashes and the login flow re-hashes transparently on the next successful sign-in.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false; // malformed hash — treat as mismatch, never throw to the caller
  }
}

export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, HASH_OPTIONS);
}

/**
 * Hash of a random password, computed once. Verifying against it when an email is unknown
 * makes "no such user" and "wrong password" take the same time (no account enumeration).
 */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash(`dummy-${String(Math.random())}`, HASH_OPTIONS);
  return dummyHash;
}
