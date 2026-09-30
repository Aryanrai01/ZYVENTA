'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check } from 'lucide-react';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/use-auth';
import { errorMessage } from '@/features/cart/use-cart';
import { engagementService } from '@/services/commerce.service';

/** "Notify me when available" for a sold-out variant. */
export function NotifyMe({ variantId }: { variantId: string }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const key = ['stock-alert', variantId];
  const subscribed = useQuery({
    queryKey: key,
    queryFn: async () => (await engagementService.alertStatus([variantId])).includes(variantId),
    enabled: status === 'authenticated',
  });
  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      if (on) await engagementService.subscribe(variantId);
      else await engagementService.unsubscribe(variantId);
      return on;
    },
    onSuccess: (on) => {
      queryClient.setQueryData(key, on);
      toast.success(on ? 'We’ll email you when it’s back' : 'Alert removed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (status !== 'authenticated') {
    return (
      <Button
        size="lg"
        variant="outline"
        className="flex-1"
        onClick={() => {
          router.push(`/login?next=${encodeURIComponent(pathname)}` as Route);
        }}
      >
        <BellRing aria-hidden="true" /> Notify me
      </Button>
    );
  }
  const on = subscribed.data === true;
  return (
    <Button
      size="lg"
      variant={on ? 'secondary' : 'outline'}
      className="flex-1"
      aria-pressed={on}
      loading={toggle.isPending}
      onClick={() => {
        toggle.mutate(!on);
      }}
    >
      {on ? <Check aria-hidden="true" /> : <BellRing aria-hidden="true" />}
      {on ? 'You’ll be notified' : 'Notify me when available'}
    </Button>
  );
}
