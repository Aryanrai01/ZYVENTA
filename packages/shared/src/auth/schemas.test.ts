import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './schemas.js';

describe('auth schemas', () => {
  it('normalises registration input', () => {
    const parsed = registerSchema.parse({
      name: ' Aarav ',
      email: ' A@Example.COM ',
      password: 'secret123',
    });
    expect(parsed).toEqual({ name: 'Aarav', email: 'a@example.com', password: 'secret123' });
  });

  it('rejects unknown fields (no role smuggling)', () => {
    expect(
      registerSchema.safeParse({
        name: 'Aarav',
        email: 'a@b.co',
        password: 'secret123',
        roles: ['ADMIN'],
      }).success,
    ).toBe(false);
  });

  it('does not apply the password policy on login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('validates opaque token shape', () => {
    const token = 'a'.repeat(43);
    expect(resetPasswordSchema.safeParse({ token, password: 'newpass123' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: 'short', password: 'newpass123' }).success).toBe(
      false,
    );
  });

  it('requires a different new password', () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: 'samepass1',
      newPassword: 'samepass1',
    });
    expect(r.success).toBe(false);
  });
});
