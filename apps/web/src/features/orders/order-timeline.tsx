import {
  SELLER_ORDER_STATUS_LABELS,
  type SellerOrderStatus,
  type StatusEvent,
} from '@zyventa/shared';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const HAPPY_PATH: SellerOrderStatus[] = [
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];
const when = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** Delivery progress for one shipment; off-path states (cancelled, returns) listed below. */
export function OrderTimeline({
  status,
  history,
}: {
  status: SellerOrderStatus;
  history: StatusEvent<SellerOrderStatus>[];
}) {
  const reached = new Map(history.map((h) => [h.status, h.at]));
  const currentIndex = HAPPY_PATH.indexOf(status);
  const offPath = history.filter((h) => !HAPPY_PATH.includes(h.status));
  const cancelled = history.some((h) => h.status === 'CANCELLED');

  return (
    <div>
      {!cancelled ? (
        <ol className="grid grid-cols-6 gap-1" aria-label="Delivery progress">
          {HAPPY_PATH.map((step, i) => {
            const done = currentIndex >= i || (currentIndex === -1 && reached.has(step));
            const at = reached.get(step);
            return (
              <li key={step} className="flex flex-col items-center text-center">
                <span className="flex w-full items-center">
                  <span
                    className={cn(
                      'h-0.5 flex-1',
                      i === 0 ? 'bg-transparent' : done ? 'bg-primary' : 'bg-border',
                    )}
                  />
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                      done
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card',
                    )}
                    aria-hidden="true"
                  >
                    {done ? <Check className="size-3.5" /> : null}
                  </span>
                  <span
                    className={cn(
                      'h-0.5 flex-1',
                      i === HAPPY_PATH.length - 1
                        ? 'bg-transparent'
                        : currentIndex > i
                          ? 'bg-primary'
                          : 'bg-border',
                    )}
                  />
                </span>
                <span
                  className={cn(
                    'mt-1 text-[11px] leading-tight',
                    done ? 'font-medium' : 'text-muted-foreground',
                  )}
                >
                  {SELLER_ORDER_STATUS_LABELS[step]}
                  <span className="sr-only">{done ? ' — done' : ' — pending'}</span>
                </span>
                {at ? (
                  <span className="hidden text-[10px] text-muted-foreground sm:block">
                    {when.format(new Date(at))}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {offPath.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {offPath.map((h) => (
            <li key={`${h.status}-${h.at}`} className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {SELLER_ORDER_STATUS_LABELS[h.status]}
              </span>{' '}
              · {when.format(new Date(h.at))}
              {h.note ? ` — ${h.note}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
