'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

/**
 * Confirmation dialog, optionally collecting a reason (required when `reasonRequired`).
 * Used for destructive or audited actions (cancel, block, suspend, reject).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  reason,
  reasonRequired = false,
  pending = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Label for an optional reason textarea. */
  reason?: string;
  reasonRequired?: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const invalid = reasonRequired && text.trim().length < 3;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setText('');
        onOpenChange(next);
      }}
    >
      <SheetContent side="center" title={title}>
        <div className="space-y-4 p-4">
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
          {children}
          {reason ? (
            <div className="space-y-2">
              <Label htmlFor="confirm-reason">{reason}</Label>
              <Textarea
                id="confirm-reason"
                value={text}
                maxLength={500}
                onChange={(e) => {
                  setText(e.target.value);
                }}
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Keep it
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              loading={pending}
              disabled={invalid}
              onClick={() => {
                onConfirm(text.trim());
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
