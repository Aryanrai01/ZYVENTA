import { Badge } from '@/components/ui/badge';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'accent';

const TONES: Record<string, Tone> = {
  // orders / shipments
  PENDING_PAYMENT: 'warning',
  PAYMENT_FAILED: 'destructive',
  EXPIRED: 'neutral',
  CONFIRMED: 'primary',
  PROCESSING: 'primary',
  PACKED: 'primary',
  SHIPPED: 'primary',
  OUT_FOR_DELIVERY: 'primary',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  RETURN_REQUESTED: 'warning',
  RETURNED: 'neutral',
  REFUND_PENDING: 'warning',
  REFUNDED: 'neutral',
  // payments
  PAID: 'success',
  PENDING: 'warning',
  FAILED: 'destructive',
  PARTIALLY_REFUNDED: 'warning',
  CAPTURED: 'success',
  CREATED: 'neutral',
  AUTHORIZED: 'primary',
  PROCESSED: 'success',
  // returns
  REQUESTED: 'warning',
  APPROVED: 'primary',
  REJECTED: 'destructive',
  PICKED_UP: 'primary',
  RECEIVED: 'primary',
  // catalogue / accounts
  ACTIVE: 'success',
  DRAFT: 'neutral',
  INACTIVE: 'neutral',
  BLOCKED: 'destructive',
  ARCHIVED: 'neutral',
  SUSPENDED: 'destructive',
  DEACTIVATED: 'neutral',
  WITHDRAWN: 'neutral',
  // moderation
  PUBLISHED: 'success',
  FLAGGED: 'warning',
  HIDDEN: 'neutral',
  REMOVED: 'destructive',
  OPEN: 'warning',
  UNDER_REVIEW: 'primary',
  RESOLVED: 'success',
  DISMISSED: 'neutral',
  NOTIFIED: 'success',
};

export const humanize = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

/** Status chip: colour always paired with the status text. */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge variant={TONES[status] ?? 'neutral'}>{label ?? humanize(status)}</Badge>;
}
