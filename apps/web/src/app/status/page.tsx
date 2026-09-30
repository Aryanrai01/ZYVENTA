import { CheckCircle2, CircleAlert, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Logo } from '@/components/layout/logo';
import { healthService } from '@/services/health.service';

export const metadata: Metadata = {
  title: 'System status',
  robots: { index: false, follow: false },
};

function StatusRow({ label, up }: { label: string; up: boolean }) {
  const Icon = up ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span className="font-medium">{label}</span>
      <span className={up ? 'text-success' : 'text-destructive'}>
        <Icon className="mr-1.5 inline size-4 align-[-2px]" aria-hidden="true" />
        {up ? 'Operational' : 'Unavailable'}
      </span>
    </li>
  );
}

/** Server-rendered live check of the API and MongoDB. */
export default async function StatusPage() {
  await connection(); // render per request — never prerender a live status
  const status = await healthService.getStatus();

  return (
    <main id="main-content" className="mx-auto max-w-xl px-4 py-12 sm:py-20">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold tracking-tight">System status</h1>

      <section className="mt-6 rounded-xl border bg-card p-5 shadow-card" aria-live="polite">
        {status.reachable ? (
          <>
            <p className="flex items-center gap-2 font-semibold">
              {status.report.status === 'ok' ? (
                <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
              ) : (
                <CircleAlert className="size-5 text-warning" aria-hidden="true" />
              )}
              {status.report.status === 'ok' ? 'All systems operational' : 'Degraded service'}
            </p>
            <ul className="mt-3 divide-y text-sm">
              <StatusRow label="API" up />
              <StatusRow label="Database (MongoDB)" up={status.report.checks.mongodb === 'up'} />
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              API v{status.report.version} · up {status.report.uptimeSeconds}s
            </p>
          </>
        ) : (
          <p className="flex items-start gap-2">
            <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <span>
              <span className="font-semibold">API unreachable.</span>{' '}
              <span className="text-muted-foreground">{status.reason}</span>
            </span>
          </p>
        )}
      </section>
    </main>
  );
}
