'use client';

import {
  AUDIT_RESOURCES,
  platformSettingsSchema,
  type AuditRow,
  type PlatformSettingsInput,
  type PlatformSettingsView,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { DataTable, FilterSelect, Pager, type Column } from '@/components/data/data-table';
import { humanize } from '@/components/data/status-badge';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/features/cart/use-cart';
import { adminService } from '@/services/admin.service';

// ── Platform settings ───────────────────────────────────────────────────────

export function AdminSettings() {
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminService.settings });
  if (settings.error) return <Alert variant="error">We couldn’t load settings.</Alert>;
  if (!settings.data) return <Skeleton className="h-96 rounded-xl" />;
  return <SettingsForm initial={settings.data} />;
}

interface Draft {
  freeShippingThreshold: string;
  flatFeePerShipment: string;
  paymentWindowMinutes: string;
  defaultWindowDays: string;
  commissionPercent: string;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  supportEmail: string;
  supportPhone: string;
}

const toRupees = (paise: number) => String(paise / 100);
const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);
const toInt = (v: string) => Number.parseInt(v, 10);

function SettingsForm({ initial }: { initial: PlatformSettingsView }) {
  const queryClient = useQueryClient();
  const [d, setD] = useState<Draft>({
    freeShippingThreshold: toRupees(initial.shipping.freeShippingThreshold),
    flatFeePerShipment: toRupees(initial.shipping.flatFeePerShipment),
    paymentWindowMinutes: String(initial.checkout.paymentWindowMinutes),
    defaultWindowDays: String(initial.returns.defaultWindowDays),
    commissionPercent: String(initial.commission.defaultBps / 100),
    maintenanceEnabled: initial.maintenance.enabled,
    maintenanceMessage: initial.maintenance.message,
    supportEmail: initial.support.email,
    supportPhone: initial.support.phone,
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (input: PlatformSettingsInput) => adminService.updateSettings(input),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'settings'], data);
      toast.success('Settings saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set =
    (key: keyof Draft, numeric = false) =>
    (e: { target: { value: string } }) => {
      setD({ ...d, [key]: numeric ? e.target.value.replace(/[^\d.]/g, '') : e.target.value });
    };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = platformSettingsSchema.safeParse({
      shipping: {
        freeShippingThreshold: toPaise(d.freeShippingThreshold),
        flatFeePerShipment: toPaise(d.flatFeePerShipment),
      },
      checkout: { paymentWindowMinutes: toInt(d.paymentWindowMinutes) },
      returns: { defaultWindowDays: toInt(d.defaultWindowDays) },
      commission: { defaultBps: Math.round(Number(d.commissionPercent) * 100) },
      maintenance: { enabled: d.maintenanceEnabled, message: d.maintenanceMessage.trim() },
      support: { email: d.supportEmail.trim(), phone: d.supportPhone.trim() },
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${issue.path.join(' › ')}: ${issue.message}` : 'Check the values');
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  };
  return (
    <>
      <PageHeader
        title="Settings"
        description={
          initial.updatedAt
            ? `Last changed ${new Date(initial.updatedAt).toLocaleString('en-IN')}. Every change is audited.`
            : 'Every change is audited.'
        }
      />
      <form onSubmit={submit} className="max-w-3xl space-y-6" noValidate>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Group title="Shipping" hint="Applied per seller shipment at checkout.">
          <Field id="s-free" label="Free delivery from (₹)">
            <Input
              id="s-free"
              inputMode="decimal"
              value={d.freeShippingThreshold}
              onChange={set('freeShippingThreshold', true)}
            />
          </Field>
          <Field id="s-fee" label="Flat fee below that (₹)">
            <Input
              id="s-fee"
              inputMode="decimal"
              value={d.flatFeePerShipment}
              onChange={set('flatFeePerShipment', true)}
            />
          </Field>
        </Group>
        <Group title="Checkout, returns & commission">
          <Field id="s-window" label="Payment window (minutes, 5–60)">
            <Input
              id="s-window"
              inputMode="numeric"
              value={d.paymentWindowMinutes}
              onChange={set('paymentWindowMinutes', true)}
            />
          </Field>
          <Field id="s-returns" label="Default return window (days)">
            <Input
              id="s-returns"
              inputMode="numeric"
              value={d.defaultWindowDays}
              onChange={set('defaultWindowDays', true)}
            />
          </Field>
          <Field id="s-commission" label="Default commission (%)">
            <Input
              id="s-commission"
              inputMode="decimal"
              value={d.commissionPercent}
              onChange={set('commissionPercent', true)}
            />
          </Field>
        </Group>
        <Group title="Support contact" hint="Shown in the footer and in emails.">
          <Field id="s-email" label="Email">
            <Input
              id="s-email"
              type="email"
              value={d.supportEmail}
              onChange={set('supportEmail')}
            />
          </Field>
          <Field id="s-phone" label="Phone">
            <Input
              id="s-phone"
              inputMode="tel"
              value={d.supportPhone}
              onChange={set('supportPhone')}
            />
          </Field>
        </Group>
        <Group title="Maintenance" hint="Shows a banner and pauses new checkouts.">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={d.maintenanceEnabled}
              onChange={(e) => {
                setD({ ...d, maintenanceEnabled: e.target.checked });
              }}
            />
            Maintenance mode
          </label>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="s-msg">Banner message</Label>
            <Textarea
              id="s-msg"
              maxLength={300}
              value={d.maintenanceMessage}
              onChange={set('maintenanceMessage')}
            />
          </div>
        </Group>
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border bg-card p-5 shadow-card">
      <legend className="px-1 font-semibold">{title}</legend>
      {hint ? <p className="mb-4 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

// ── Audit log ───────────────────────────────────────────────────────────────

const auditFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

export function AdminAudit() {
  const [resource, setResource] = useState<(typeof AUDIT_RESOURCES)[number] | ''>('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['admin', 'audit', resource, page],
    queryFn: () => adminService.audit({ page, resource: resource || undefined }),
  });
  const columns: Column<AuditRow>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (r) => (
        <span className="whitespace-nowrap">{auditFmt.format(new Date(r.createdAt))}</span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      cell: (r) => (
        <span>
          {r.actor?.name ?? 'System'}
          <span className="block text-xs text-muted-foreground">
            {humanize(r.actorRole)}
            {r.ip ? ` · ${r.ip}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (r) => (
        <span>
          <code className="text-xs">{r.action}</code>
          <span className="block text-xs text-muted-foreground">
            {humanize(r.resource)} {r.resourceId.slice(-8)}
          </span>
        </span>
      ),
    },
    {
      key: 'meta',
      header: 'Details',
      hideOnMobile: true,
      cell: (r) =>
        Object.keys(r.metadata).length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs text-primary">View</summary>
            <pre className="mt-1 max-w-sm overflow-x-auto rounded bg-muted p-2 text-[11px]">
              {JSON.stringify(r.metadata, null, 2)}
            </pre>
          </details>
        ) : (
          '—'
        ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only record of privileged actions. Secrets and tokens are never recorded."
      />
      <div className="mb-4">
        <FilterSelect
          label="Resource"
          value={resource}
          options={AUDIT_RESOURCES.map((r) => ({ value: r, label: humanize(r) }))}
          onChange={(v) => {
            setResource(v);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        caption="Audit log"
        columns={columns}
        rows={query.data?.data}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        emptyTitle="No entries"
      />
      <Pager meta={query.data?.pagination} onPage={setPage} />
    </>
  );
}
