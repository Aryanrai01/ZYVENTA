'use client';

import {
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  type OrderItemView,
  type ReturnReason,
} from '@zyventa/shared';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function ReturnDialog({
  item,
  onClose,
  onSubmit,
  pending,
}: {
  item: OrderItemView | null;
  onClose: () => void;
  onSubmit: (input: { quantity: number; reason: ReturnReason; comment: string }) => void;
  pending: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [comment, setComment] = useState('');
  const max = item ? item.quantity - item.returnedQuantity : 1;
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="center" title="Return an item" description={item?.name}>
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason) onSubmit({ quantity, reason, comment });
          }}
        >
          {max > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="return-qty">Quantity</Label>
              <Input
                id="return-qty"
                type="number"
                min={1}
                max={max}
                value={quantity}
                onChange={(e) => {
                  setQuantity(Math.min(max, Math.max(1, Number(e.target.value) || 1)));
                }}
              />
            </div>
          ) : null}
          <fieldset>
            <legend className="text-sm font-medium">Why are you returning it?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {RETURN_REASONS.map((r) => (
                <label
                  key={r}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => {
                      setReason(r);
                    }}
                    className="accent-primary"
                  />
                  {RETURN_REASON_LABELS[r]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="return-comment">Anything else? (optional)</Label>
            <Textarea
              id="return-comment"
              maxLength={1000}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Your refund starts once the seller receives the item.
          </p>
          <Button type="submit" fullWidth loading={pending} disabled={!reason}>
            Request return
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const labels = ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];
  return (
    <fieldset>
      <legend className="text-sm font-medium">Your rating</legend>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" title={labels[n - 1]}>
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => {
                onChange(n);
              }}
              className="peer sr-only"
            />
            <span className="sr-only">
              {n} stars — {labels[n - 1]}
            </span>
            <Star
              aria-hidden="true"
              className={cn(
                'size-8 rounded peer-focus-visible:outline-2 peer-focus-visible:outline-ring',
                n <= value ? 'fill-accent text-accent' : 'text-muted-foreground',
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewDialog({
  item,
  onClose,
  onSubmit,
  pending,
}: {
  item: { id: string; name: string } | null;
  onClose: () => void;
  onSubmit: (input: { rating: number; title: string; body: string }) => void;
  pending: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="center" title="Write a review" description={item?.name}>
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rating > 0) onSubmit({ rating, title, body });
          }}
        >
          <StarInput value={rating} onChange={setRating} />
          <div className="space-y-2">
            <Label htmlFor="review-title">Headline</Label>
            <Input
              id="review-title"
              maxLength={120}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
              placeholder="What stood out?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-body">Your review</Label>
            <Textarea
              id="review-body"
              maxLength={5000}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
              }}
              placeholder="Share details that help other shoppers"
            />
          </div>
          <Button type="submit" fullWidth loading={pending} disabled={rating === 0}>
            Publish review
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
