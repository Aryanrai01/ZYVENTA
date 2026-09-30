import { PackageCheck, ShieldCheck, Store } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/logo';

const points = [
  { icon: Store, text: 'Thousands of products from verified sellers' },
  { icon: ShieldCheck, text: 'Secure payments, verified on our servers' },
  { icon: PackageCheck, text: 'Track every order from checkout to doorstep' },
];

/** Shared shell for sign-in, sign-up and account-recovery pages. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <p className="text-xl font-semibold tracking-tight">ZYVENTA</p>
        <div className="max-w-md">
          <h2 className="text-3xl font-bold tracking-tight text-balance">
            Everything you need, from sellers you can trust.
          </h2>
          <ul className="mt-8 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-base opacity-95">
                <span className="flex size-9 items-center justify-center rounded-full bg-white/15">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm opacity-80">© {new Date().getFullYear()} ZYVENTA</p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-accent/30 blur-3xl"
        />
      </aside>

      <main id="main-content" className="flex flex-col px-4 py-6 sm:px-8 sm:py-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
