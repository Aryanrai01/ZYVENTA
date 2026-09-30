'use client';

import { REVIEW_SORTS } from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Flag, MessageSquareReply, Star } from 'lucide-react';
import { useState } from 'react';
import { Pager } from '@/components/data/data-table';
import { toast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/use-auth';
import { errorMessage } from '@/features/cart/use-cart';
import { ReviewDialog } from '@/features/orders/order-dialogs';
import { cn } from '@/lib/utils';
import { engagementService } from '@/services/commerce.service';

const SORT_LABELS: Record<(typeof REVIEW_SORTS)[number], string> = {
  newest: 'Newest',
  highest: 'Highest rating',
  lowest: 'Lowest rating',
  helpful: 'Most helpful',
};
const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function Stars({ value, size = 'size-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn(size, n <= Math.round(value) ? 'fill-accent text-accent' : 'text-border')}
        />
      ))}
    </span>
  );
}

/** Ratings summary, distribution bars, sortable review list and "write a review". */
export function ReviewsSection({ slug, productName }: { slug: string; productName: string }) {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<(typeof REVIEW_SORTS)[number]>('newest');
  const [rating, setRating] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState<{ id: string; name: string } | null>(null);

  const reviews = useQuery({
    queryKey: ['reviews', slug, sort, rating, page],
    queryFn: () => engagementService.reviews(slug, { sort, page, ...(rating ? { rating } : {}) }),
  });
  const eligible = useQuery({
    queryKey: ['reviews', slug, 'eligible'],
    queryFn: () => engagementService.eligibleReviews(slug),
    enabled: status === 'authenticated',
  });
  const create = useMutation({
    mutationFn: (input: { rating: number; title: string; body: string }) =>
      engagementService.createReview({ orderItemId: writing?.id ?? '', ...input }),
    onSuccess: () => {
      setWriting(null);
      toast.success('Thanks for your review!');
      void queryClient.invalidateQueries({ queryKey: ['reviews', slug] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const report = useMutation({
    mutationFn: (id: string) =>
      engagementService.report({
        targetType: 'REVIEW',
        targetId: id,
        reason: 'OFFENSIVE_CONTENT',
        details: '',
      }),
    onSuccess: () => toast.success('Thanks — our team will take a look'),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const summary = reviews.data?.data.summary;
  const items = reviews.data?.data.items ?? [];
  const canWrite = (eligible.data ?? [])[0];

  return (
    <section
      aria-labelledby="reviews-heading"
      className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="reviews-heading" className="text-xl font-bold tracking-tight sm:text-2xl">
          Ratings & reviews
        </h2>
        {canWrite ? (
          <Button
            variant="outline"
            onClick={() => {
              setWriting({ id: canWrite.orderItemId, name: productName });
            }}
          >
            Write a review
          </Button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[280px_1fr]">
        <div>
          {!summary ? (
            <Skeleton className="h-40" />
          ) : summary.count === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reviews yet. Reviews come from verified buyers only.
            </p>
          ) : (
            <>
              <p className="flex items-center gap-3">
                <span className="text-4xl font-bold tabular-nums">
                  {summary.average.toFixed(1)}
                </span>
                <span>
                  <Stars value={summary.average} />
                  <span className="block text-sm text-muted-foreground">
                    {summary.count} reviews
                  </span>
                </span>
              </p>
              <ul className="mt-4 space-y-1.5">
                {summary.distribution.map((n, i) => {
                  const star = 5 - i;
                  const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
                  return (
                    <li key={star}>
                      <button
                        type="button"
                        aria-pressed={rating === star}
                        onClick={() => {
                          setRating(rating === star ? undefined : star);
                          setPage(1);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-1 text-sm hover:bg-muted',
                          rating === star && 'bg-primary-soft',
                        )}
                      >
                        <span className="w-6 tabular-nums">{star}★</span>
                        <span
                          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                          aria-hidden="true"
                        >
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${String(pct)}%` }}
                          />
                        </span>
                        <span className="w-10 text-right text-muted-foreground tabular-nums">
                          {pct}%
                        </span>
                        <span className="sr-only">
                          {n} reviews with {star} stars
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="min-w-0">
          {summary && summary.count > 0 ? (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <label htmlFor="review-sort" className="text-muted-foreground">
                Sort by
              </label>
              <select
                id="review-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as typeof sort);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-card px-2"
              >
                {REVIEW_SORTS.map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <ul className="divide-y">
            {items.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} />
                  {r.title ? <span className="font-medium">{r.title}</span> : null}
                </div>
                {r.body ? <p className="mt-2 text-sm whitespace-pre-line">{r.body}</p> : null}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{r.authorName}</span>
                  {r.isVerifiedPurchase ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <BadgeCheck className="size-3.5" aria-hidden="true" /> Verified purchase
                    </span>
                  ) : null}
                  {r.variantLabel ? <span>{r.variantLabel}</span> : null}
                  <span>{dateFmt.format(new Date(r.createdAt))}</span>
                  {status === 'authenticated' && !r.isMine ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => {
                        report.mutate(r.id);
                      }}
                    >
                      <Flag className="size-3" aria-hidden="true" /> Report
                    </button>
                  ) : null}
                </p>
                {r.sellerResponse ? (
                  <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                    <p className="flex items-center gap-1 text-xs font-medium">
                      <MessageSquareReply className="size-3.5" aria-hidden="true" /> Response from
                      the seller
                    </p>
                    <p className="mt-1">{r.sellerResponse.body}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <Pager meta={reviews.data?.pagination} onPage={setPage} />
        </div>
      </div>
      <ReviewDialog
        item={writing}
        onClose={() => {
          setWriting(null);
        }}
        pending={create.isPending}
        onSubmit={(input) => {
          create.mutate(input);
        }}
      />
    </section>
  );
}
