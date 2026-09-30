import { describe, expect, it } from 'vitest';
import { PATTERNS, adminPasswordSchema, passwordSchema, slugify } from './fields.js';

describe('field patterns', () => {
  it('validates Indian identifiers', () => {
    expect(PATTERNS.indianMobile.test('9876543210')).toBe(true);
    expect(PATTERNS.indianMobile.test('1234567890')).toBe(false);
    expect(PATTERNS.pincode.test('560103')).toBe(true);
    expect(PATTERNS.pincode.test('060103')).toBe(false);
    expect(PATTERNS.gstin.test('29ABCDE1234F1Z5')).toBe(true);
    expect(PATTERNS.gstin.test('29ABCDE1234F1X5')).toBe(false);
    expect(PATTERNS.ifsc.test('HDFC0001234')).toBe(true);
  });

  it('only accepts internal notification links', () => {
    expect(PATTERNS.internalPath.test('/orders/abc')).toBe(true);
    expect(PATTERNS.internalPath.test('//evil.example')).toBe(false);
    expect(PATTERNS.internalPath.test('https://evil.example')).toBe(false);
  });

  it('accepts https images and bundled placeholders only', () => {
    expect(PATTERNS.imageUrl.test('https://res.cloudinary.com/x/image/upload/a.jpg')).toBe(true);
    expect(PATTERNS.imageUrl.test('/placeholders/electronics.svg')).toBe(true);
    expect(PATTERNS.imageUrl.test('http://insecure.example/a.jpg')).toBe(false);
    expect(PATTERNS.imageUrl.test('javascript:alert(1)')).toBe(false);
  });
});

describe('password policy', () => {
  it('requires length plus a letter and a digit', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('longpassword').success).toBe(false);
    expect(passwordSchema.safeParse('longpassword1').success).toBe(true);
  });

  it('is stricter for admins', () => {
    expect(adminPasswordSchema.safeParse('password123').success).toBe(false);
    expect(adminPasswordSchema.safeParse('password1234').success).toBe(true);
  });
});

describe('slugify', () => {
  it('produces clean slugs', () => {
    expect(slugify('  Men’s Running Shoes & Socks! ')).toBe('men-s-running-shoes-and-socks');
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });
});
