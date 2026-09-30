import { describe, expect, it } from 'vitest';
import { SELLER_ORDER_STATUSES } from '../constants/statuses.js';
import {
  SELLER_ORDER_TRANSITIONS,
  returnStateMachine,
  sellerOrderStateMachine as sm,
} from './order-status.js';

describe('seller order state machine', () => {
  it('defines rules for every status', () => {
    expect(Object.keys(SELLER_ORDER_TRANSITIONS).sort()).toEqual([...SELLER_ORDER_STATUSES].sort());
  });

  it('allows the happy path for sellers', () => {
    const path = [
      'CONFIRMED',
      'PROCESSING',
      'PACKED',
      'SHIPPED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ] as const;
    path.slice(1).forEach((to, i) => {
      expect(sm.canTransition(path[i] ?? 'CONFIRMED', to, 'SELLER')).toBe(true);
    });
  });

  it('rejects skipping or reversing steps', () => {
    expect(sm.canTransition('CONFIRMED', 'SHIPPED', 'SELLER')).toBe(false);
    expect(sm.canTransition('SHIPPED', 'PROCESSING', 'ADMIN')).toBe(false);
    expect(sm.canTransition('DELIVERED', 'CANCELLED', 'ADMIN')).toBe(false);
  });

  it('lets customers cancel only before packing', () => {
    expect(sm.canTransition('CONFIRMED', 'CANCELLED', 'CUSTOMER')).toBe(true);
    expect(sm.canTransition('PROCESSING', 'CANCELLED', 'CUSTOMER')).toBe(true);
    expect(sm.canTransition('PACKED', 'CANCELLED', 'CUSTOMER')).toBe(false);
  });

  it('keeps customers from driving fulfilment', () => {
    expect(sm.nextStatuses('CONFIRMED', 'CUSTOMER')).toEqual(['CANCELLED']);
    expect(sm.canTransition('SHIPPED', 'DELIVERED', 'CUSTOMER')).toBe(false);
  });

  it('only lets the system or admins settle refunds', () => {
    expect(sm.canTransition('REFUND_PENDING', 'REFUNDED', 'SELLER')).toBe(false);
    expect(sm.canTransition('REFUND_PENDING', 'REFUNDED', 'SYSTEM')).toBe(true);
  });

  it('marks REFUNDED as terminal', () => {
    expect(sm.isTerminal('REFUNDED')).toBe(true);
    expect(sm.isTerminal('DELIVERED')).toBe(false);
  });
});

describe('return state machine', () => {
  it('follows approve → pickup → receive → refund', () => {
    expect(returnStateMachine.canTransition('REQUESTED', 'APPROVED', 'SELLER')).toBe(true);
    expect(returnStateMachine.canTransition('APPROVED', 'PICKED_UP', 'SELLER')).toBe(true);
    expect(returnStateMachine.canTransition('PICKED_UP', 'RECEIVED', 'SELLER')).toBe(true);
    expect(returnStateMachine.canTransition('RECEIVED', 'REFUNDED', 'SYSTEM')).toBe(true);
  });

  it('prevents customers approving their own returns', () => {
    expect(returnStateMachine.canTransition('REQUESTED', 'APPROVED', 'CUSTOMER')).toBe(false);
  });
});
