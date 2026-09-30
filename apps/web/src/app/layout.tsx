import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { publicEnv } from '@/lib/env';
import { Providers } from './providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: 'ZYVENTA — Shop everything, from sellers you trust',
    template: '%s | ZYVENTA',
  },
  description:
    'ZYVENTA is a multi-vendor marketplace for electronics, fashion, home and more — with secure payments and fast delivery.',
  applicationName: 'ZYVENTA',
  openGraph: {
    type: 'website',
    siteName: 'ZYVENTA',
    locale: 'en_IN',
  },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#16151d' },
  ],
};

/**
 * Reading the request headers opts every page into per-request rendering, which the nonce-based
 * CSP (src/proxy.ts) requires: Next.js stamps the nonce on its scripts at render time. API data
 * is still cached per fetch (`next.revalidate`), so this costs rendering, not backend load.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers();
  return (
    <html lang="en-IN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
