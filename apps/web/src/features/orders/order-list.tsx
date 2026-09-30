'use client';

import { ORDER_STATUS_LABELS, type OrderListItem } from '@zyventa/shared';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import { Pager } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState } from '@/components/feedback/empty-state';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/lib/format';
import { orderService } from '@/services/commerce.service';

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function OrderList() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['orders', page],
    queryFn: () => orderService.list({ page, limit: 10 }),
  });

  if (query.error)
    return <Alert variant="error">We couldn’t load your orders. Please refresh.</Alert>;
  if (query.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }
  const orders = query.data.data;
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No orders yet"
        description="When you place an order, you can track it here."
        action={
          <Button asChild>
            <Link href="/products">Start shopping</Link>
          </Button>
        }
      />
    );
  }
  return (
    <>
      <ul className="space-y-3">
        {orders.map((o) => (
          <OrderRow key={o.id} order={o} />
        ))}
      </ul>
      <Pager meta={query.data.pagination} onPage={setPage} />
    </>
  );
}

function OrderRow({ order }: { order: OrderListItem }) {
  const shipment = order.shipmentStatuses.length === 1 ? order.shipmentStatuses[0] : undefined;
  return (
    <li>
      <Link
        href={`/orders/${order.id}` as Route}
        className="block rounded-xl border bg-card p-4 shadow-card transition-shadow hover:shadow-raised"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">{order.orderNumber}</p>
            <p className="text-xs text-muted-foreground">
              Placed {dateFmt.format(new Date(order.createdAt))} · {order.itemCount}{' '}
              {order.itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {order.status === 'CONFIRMED' && shipment ? (
              <StatusBadge status={shipment} />
            ) : (
              <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
            )}
            <span className="font-semibold tabular-nums">{formatPrice(order.total)}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex -space-x-2">
            {order.previewImages.slice(0, 4).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element -- tiny previews; SVG placeholders and Cloudinary URLs
              <img
                key={src}
                src={src}
                alt=""
                className="size-10 rounded-md border bg-muted object-contain"
              />
            ))}
          </div>
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {order.previewNames.join(', ')}
          </p>
        </div>
      </Link>
    </li>
  );
}
