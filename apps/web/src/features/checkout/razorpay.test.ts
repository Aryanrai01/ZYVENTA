// @vitest-environment jsdom
import type { PaymentInit } from '@zyventa/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newIdempotencyKey, payWithRazorpay } from './razorpay';

type Opts = {
  key: string;
  order_id: string;
  amount: number;
  handler: (r: Record<string, string>) => void;
  modal: { ondismiss: () => void };
};

const init: PaymentInit = {
  orderId: 'o1',
  orderNumber: 'ZY-1',
  razorpayOrderId: 'order_X',
  keyId: 'rzp_test_public',
  amount: 49_900,
  currency: 'INR',
  prefill: { name: 'A', email: 'a@example.com', contact: '9876543210' },
  expiresAt: new Date().toISOString(),
};

function installFake(behaviour: (o: Opts, failed: (d: string) => void) => void) {
  let captured: Opts | undefined;
  class FakeRazorpay {
    private failCb: ((e: { error: { description?: string } }) => void) | undefined;
    constructor(private readonly o: Opts) {
      captured = o;
    }
    on(_: string, cb: (e: { error: { description?: string } }) => void) {
      this.failCb = cb;
    }
    open() {
      behaviour(this.o, (d) => this.failCb?.({ error: { description: d } }));
    }
  }
  window.Razorpay = FakeRazorpay as unknown as typeof window.Razorpay;
  return () => captured;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.Razorpay;
});

describe('payWithRazorpay', () => {
  it('passes only the public key and server-issued order to the widget', async () => {
    const get = installFake((o) => {
      o.handler({
        razorpay_order_id: 'order_X',
        razorpay_payment_id: 'pay_1',
        razorpay_signature: 'sig',
      });
    });
    const outcome = await payWithRazorpay(init);
    const opts = get();
    expect(opts?.key).toBe('rzp_test_public');
    expect(opts?.order_id).toBe('order_X');
    expect(opts?.amount).toBe(49_900);
    expect(outcome).toEqual({
      kind: 'paid',
      payload: {
        razorpayOrderId: 'order_X',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig',
      },
    });
  });

  it('reports dismissal and failure distinctly, settling only once', async () => {
    installFake((o) => {
      o.modal.ondismiss();
      o.modal.ondismiss();
    });
    await expect(payWithRazorpay(init)).resolves.toEqual({ kind: 'dismissed' });

    installFake((_o, failed) => {
      failed('Card declined');
    });
    await expect(payWithRazorpay(init)).resolves.toEqual({
      kind: 'failed',
      message: 'Card declined',
    });
  });
});

describe('newIdempotencyKey', () => {
  it('returns 32 hex chars and is unique per call', () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});
