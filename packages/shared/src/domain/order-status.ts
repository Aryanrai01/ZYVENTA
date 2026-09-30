import type { ReturnStatus, SellerOrderStatus } from '../constants/statuses.js';
import { createStateMachine, type TransitionRules } from './state-machine.js';

const CS = ['CUSTOMER', 'SELLER', 'ADMIN', 'SYSTEM'] as const;
const SA = ['SELLER', 'ADMIN'] as const;
const SAS = ['SELLER', 'ADMIN', 'SYSTEM'] as const;
const AS = ['ADMIN', 'SYSTEM'] as const;

/**
 * Seller-order (shipment) lifecycle.
 *
 *   CONFIRMED → PROCESSING → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
 *   CONFIRMED | PROCESSING | PACKED → CANCELLED → REFUND_PENDING → REFUNDED
 *   DELIVERED → RETURN_REQUESTED → RETURNED → REFUND_PENDING → REFUNDED
 *
 * Customers may cancel only before packing. The return window is enforced by the service
 * (it depends on the product's policy and delivery date), not by this table.
 */
export const SELLER_ORDER_TRANSITIONS: TransitionRules<SellerOrderStatus> = {
  CONFIRMED: { PROCESSING: SA, CANCELLED: CS },
  PROCESSING: { PACKED: SA, CANCELLED: CS },
  PACKED: { SHIPPED: SA, CANCELLED: ['SELLER', 'ADMIN', 'SYSTEM'] },
  SHIPPED: { OUT_FOR_DELIVERY: SAS, DELIVERED: SAS },
  OUT_FOR_DELIVERY: { DELIVERED: SAS },
  DELIVERED: { RETURN_REQUESTED: ['CUSTOMER', 'ADMIN'] },
  // Back to DELIVERED when every return on the shipment is rejected or withdrawn.
  RETURN_REQUESTED: { RETURNED: SA, DELIVERED: SAS },
  RETURNED: { REFUND_PENDING: SAS },
  CANCELLED: { REFUND_PENDING: AS },
  REFUND_PENDING: { REFUNDED: AS },
  REFUNDED: {},
};

export const sellerOrderStateMachine = createStateMachine(SELLER_ORDER_TRANSITIONS);

/** Statuses after which the shipment can no longer be cancelled by anyone. */
export const SELLER_ORDER_SHIPPED_STATES: readonly SellerOrderStatus[] = [
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURN_REQUESTED',
  'RETURNED',
];

/** Per-item return request lifecycle. */
export const RETURN_TRANSITIONS: TransitionRules<ReturnStatus> = {
  REQUESTED: { APPROVED: SA, REJECTED: SA, CANCELLED: ['CUSTOMER', 'ADMIN'] },
  APPROVED: { PICKED_UP: SA, CANCELLED: ['CUSTOMER', 'ADMIN'] },
  PICKED_UP: { RECEIVED: SA },
  RECEIVED: { REFUNDED: AS },
  REJECTED: {},
  REFUNDED: {},
  CANCELLED: {},
};

export const returnStateMachine = createStateMachine(RETURN_TRANSITIONS);
