'use client';

import {
  SELLER_ORDER_STATUS_LABELS,
  type SellerOrderStatus,
  type SellerOrderStatusUpdate,
} from '@zyventa/shared';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/data/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';

/** Next-step buttons for a shipment; shipping collects carrier + tracking, cancelling a reason. */
export function ShipmentActions({
  next,
  pending,
  onUpdate,
}: {
  next: SellerOrderStatus[];
  pending: boolean;
  onUpdate: (input: SellerOrderStatusUpdate) => void;
}) {
  const [shipping, setShipping] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [url, setUrl] = useState('');
  if (next.length === 0)
    return <p className="text-sm text-muted-foreground">No further action needed.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((status) =>
        status === 'CANCELLED' ? (
          <Button
            key={status}
            variant="outline"
            onClick={() => {
              setCancelling(true);
            }}
          >
            Cancel shipment
          </Button>
        ) : (
          <Button
            key={status}
            loading={pending}
            onClick={() => {
              if (status === 'SHIPPED') setShipping(true);
              else onUpdate({ status });
            }}
          >
            Mark as {SELLER_ORDER_STATUS_LABELS[status].toLowerCase()}
          </Button>
        ),
      )}
      <Sheet open={shipping} onOpenChange={setShipping}>
        <SheetContent side="center" title="Ship this order">
          <form
            className="space-y-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              onUpdate({
                status: 'SHIPPED',
                carrier,
                trackingNumber: tracking,
                ...(url ? { trackingUrl: url } : {}),
              });
              setShipping(false);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="carrier">Courier</Label>
              <Input
                id="carrier"
                required
                minLength={2}
                maxLength={60}
                value={carrier}
                onChange={(e) => {
                  setCarrier(e.target.value);
                }}
                placeholder="e.g. Delhivery"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tracking">Tracking number</Label>
              <Input
                id="tracking"
                required
                minLength={3}
                maxLength={60}
                value={tracking}
                onChange={(e) => {
                  setTracking(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trackurl">Tracking link (optional)</Label>
              <Input
                id="trackurl"
                type="url"
                pattern="https://.*"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                }}
                placeholder="https://"
              />
            </div>
            <Button type="submit" fullWidth loading={pending}>
              Mark as shipped
            </Button>
          </form>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this shipment?"
        description="The customer is refunded in full and the items go back into stock."
        confirmLabel="Cancel shipment"
        destructive
        reason="Reason (shared with the customer)"
        reasonRequired
        pending={pending}
        onConfirm={(note) => {
          onUpdate({ status: 'CANCELLED', note });
          setCancelling(false);
        }}
      />
    </div>
  );
}
