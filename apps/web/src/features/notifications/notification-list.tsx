'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import { Pager } from '@/components/data/data-table';
import { EmptyState } from '@/components/feedback/empty-state';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { engagementService } from '@/services/commerce.service';
import { notificationKeys } from './notification-bell';

const when = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export function NotificationList() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useQuery({
    queryKey: [...notificationKeys.all, 'list', page, unreadOnly],
    queryFn: () =>
      engagementService.notifications({ page, ...(unreadOnly ? { unread: true } : {}) }),
  });
  const markRead = useMutation({
    mutationFn: engagementService.markRead,
    onSuccess: (unread) => {
      queryClient.setQueryData(notificationKeys.unread, unread);
      void queryClient.invalidateQueries({ queryKey: [...notificationKeys.all, 'list'] });
    },
  });

  if (query.error) return <Alert variant="error">We couldn’t load notifications.</Alert>;
  const data = query.data?.data;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={unreadOnly}
            onChange={(e) => {
              setUnreadOnly(e.target.checked);
              setPage(1);
            }}
          />
          Unread only
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.unread}
          loading={markRead.isPending && markRead.variables === 'all'}
          onClick={() => {
            markRead.mutate('all');
          }}
        >
          <CheckCheck aria-hidden="true" /> Mark all as read
        </Button>
      </div>
      {!data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? 'You’re all caught up' : 'No notifications yet'}
          description="Order updates, back-in-stock alerts and account messages appear here."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-card">
          {data.items.map((n) => (
            <li key={n.id} className={cn('flex gap-3 p-4', !n.readAt && 'bg-primary-soft/40')}>
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  n.readAt ? 'bg-transparent' : 'bg-primary',
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {n.link ? (
                    <Link
                      href={n.link as Route}
                      className="hover:underline"
                      onClick={() => {
                        if (!n.readAt) markRead.mutate(n.id);
                      }}
                    >
                      {n.title}
                    </Link>
                  ) : (
                    n.title
                  )}
                  {!n.readAt ? <span className="sr-only"> (unread)</span> : null}
                </p>
                {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {when.format(new Date(n.createdAt))}
                </p>
              </div>
              {!n.readAt ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    markRead.mutate(n.id);
                  }}
                  aria-label={`Mark “${n.title}” as read`}
                >
                  Mark read
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pager meta={query.data?.pagination} onPage={setPage} />
    </div>
  );
}
