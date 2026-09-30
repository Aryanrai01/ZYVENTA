import { AUTH_COOKIES } from '@zyventa/shared';
import { NextResponse, type NextRequest } from 'next/server';

const PRIVATE_PREFIXES = ['/account', '/seller', '/admin', '/checkout', '/orders'];
const isDev = process.env.NODE_ENV !== 'production';

function origin(url: string | undefined): string {
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
}

/**
 * Nonce-based Content-Security-Policy. Next.js reads the nonce from the request's CSP header
 * and applies it to its own scripts; 'strict-dynamic' lets those trusted scripts load
 * Razorpay Checkout. Inline style attributes are allowed (layout values), scripts are not.
 */
export function buildCsp(nonce: string): string {
  const api = origin(process.env.NEXT_PUBLIC_API_URL);
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      'https://checkout.razorpay.com',
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      api,
      'https://api.cloudinary.com',
      'https://api.razorpay.com',
      'https://lumberjack.razorpay.com',
      ...(isDev ? ['ws:'] : []),
    ].filter(Boolean),
    'frame-src': ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
    'form-action': ["'self'", 'https://api.razorpay.com'],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
  const policy = Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

/**
 * 1. Early redirect for private areas when the browser holds no session at all (UX only: it
 *    reads a non-secret hint cookie; the API remains the sole authority on access).
 * 2. Per-request CSP nonce for every HTML response.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const hasSession =
      request.cookies.get(AUTH_COOKIES.sessionHint)?.value === '1' ||
      request.cookies.has(AUTH_COOKIES.accessToken);
    if (!hasSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      loginUrl.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except static assets, image optimiser output and metadata files.
      source:
        '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
