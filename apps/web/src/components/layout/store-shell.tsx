import type { ReactNode } from 'react';
import { MobileTabBar } from './mobile-tab-bar';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/** Page chrome shared by every storefront and account page. */
export function StoreShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
