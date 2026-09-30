'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { ProductImage } from '@/components/catalog/product-image';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState } from '@/components/feedback/empty-state';
import { toast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/cart/use-cart';
import { engagementService } from '@/services/commerce.service';

export function StockAlerts() {
  const queryClient = useQueryClient();
  const alerts = useQuery({ queryKey: ['stock-alerts'], queryFn: engagementService.stockAlerts });
  const remove = useMutation({
    mutationFn: engagementService.unsubscribe,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
      toast.success('Alert removed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Stock alerts</h1>
        <p className="mt-1 text-muted-foreground">We’ll notify you as soon as these are back.</p>
      </div>
      {!alerts.data ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : alerts.data.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="No stock alerts"
          description="Tap “Notify me” on any sold-out product to get an alert when it’s back."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-card">
          {alerts.data.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-4">
              <div className="w-14 shrink-0">
                <ProductImage
                  image={a.product.image ? { url: a.product.image, alt: a.product.name } : null}
                  sizes="56px"
                  className="rounded-md border"
                />
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <Link
                  href={`/products/${a.product.slug}?variant=${a.variantId}` as Route}
                  className="font-medium hover:underline"
                >
                  {a.product.name}
                </Link>
                <p className="text-muted-foreground">{Object.values(a.options).join(' · ')}</p>
                <p className="mt-1">
                  {a.inStock ? (
                    <StatusBadge status="ACTIVE" label="Back in stock" />
                  ) : (
                    <StatusBadge
                      status={a.status}
                      label={a.status === 'ACTIVE' ? 'Waiting' : 'Notified'}
                    />
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  remove.mutate(a.variantId);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
