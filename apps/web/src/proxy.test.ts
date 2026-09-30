import { AUTH_COOKIES } from '@zyventa/shared';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { buildCsp, proxy } from './proxy';

const req = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, 'http://localhost:3000'), {
    headers: cookie ? { cookie } : {},
  });

describe('buildCsp', () => {
  const csp = buildCsp('abc123');

  it('uses a nonce with strict-dynamic and never allows inline scripts', () => {
    expect(csp).toMatch(/script-src [^;]*'nonce-abc123'/);
    expect(csp).toMatch(/script-src [^;]*'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/);
  });

  it('allows exactly the third parties the app needs', () => {
    expect(csp).toContain('https://checkout.razorpay.com');
    expect(csp).toMatch(/frame-src [^;]*https:\/\/api\.razorpay\.com/);
    expect(csp).toMatch(/img-src [^;]*https:\/\/res\.cloudinary\.com/);
    expect(csp).toMatch(/connect-src [^;]*http:\/\/localhost:4000/);
  });

  it('forbids framing, plugins and base-tag hijacking', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});

describe('proxy', () => {
  it('redirects signed-out visitors away from private areas, preserving the target', () => {
    const res = proxy(req('/admin/orders?page=2'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/admin/orders?page=2');
  });

  it('does not treat look-alike paths as private', () => {
    expect(proxy(req('/administrator')).status).toBe(200);
  });

  it('lets a session through and sets a fresh nonce per request', () => {
    const cookie = `${AUTH_COOKIES.sessionHint}=1`;
    const a = proxy(req('/seller', cookie)).headers.get('content-security-policy') ?? '';
    const b = proxy(req('/seller', cookie)).headers.get('content-security-policy') ?? '';
    expect(a).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(a).not.toBe(b);
  });

  it('adds the CSP to public pages too', () => {
    const res = proxy(req('/'));
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});
