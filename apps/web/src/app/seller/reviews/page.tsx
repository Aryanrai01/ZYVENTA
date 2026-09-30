'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Star } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import { Pager } from '@/components/data/data-table';
import { EmptyState } from '@/components/feedback/empty-state';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/features/cart/use-cart';
import { sellerService } from '@/services/seller.service';

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export default function SellerReviewsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [text, setText] = useState('');
  const reviews = useQuery({
    queryKey: ['seller', 'reviews', page],
    queryFn: () => sellerService.reviews({ page }),
  });
  const respond = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      sellerService.respondToReview(id, body),
    onSuccess: () => {
      toast.success('Response published');
      setReplyTo(null);
      setText('');
      void queryClient.invalidateQueries({ queryKey: ['seller', 'reviews'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const items = reviews.data?.data;
  return (
    <>
      <PageHeader title="Reviews" description="Reply publicly to reviews of your products." />
      {!items ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : items.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No reviews yet" />
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link
                  href={`/products/${r.product.slug}` as Route}
                  className="font-medium hover:underline"
                >
                  {r.product.name}
                </Link>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Star className="size-4 fill-accent text-accent" aria-hidden="true" /> {r.rating}
                  /5 · {r.authorName} · {dateFmt.format(new Date(r.createdAt))}
                </span>
              </div>
              {r.title ? <p className="mt-2 font-medium">{r.title}</p> : null}
              {r.body ? <p className="mt-1 text-sm whitespace-pre-line">{r.body}</p> : null}
              {r.sellerResponse ? (
                <p className="mt-3 rounded-md bg-muted p-3 text-sm">
                  <span className="font-medium">Your response: </span>
                  {r.sellerResponse.body}
                </p>
              ) : null}
              {replyTo === r.id ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    respond.mutate({ id: r.id, body: text });
                  }}
                >
                  <label htmlFor={`reply-${r.id}`} className="sr-only">
                    Your response
                  </label>
                  <Textarea
                    id={`reply-${r.id}`}
                    maxLength={2000}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      loading={respond.isPending}
                      disabled={text.trim().length < 2}
                    >
                      Publish
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReplyTo(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => {
                    setReplyTo(r.id);
                    setText(r.sellerResponse?.body ?? '');
                  }}
                >
                  {r.sellerResponse ? 'Edit response' : 'Respond'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager meta={reviews.data?.pagination} onPage={setPage} />
    </>
  );
}
