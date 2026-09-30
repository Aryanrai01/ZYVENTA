import type { PaymentInit, VerifyPaymentInput } from '@zyventa/shared';

/**
 * Razorpay Checkout (hosted, PCI-compliant). Card/UPI details are entered inside Razorpay's
 * iframe — they never touch our servers or this page's JavaScript. The browser only receives
 * the public key id; the secret stays on the API.
 */
const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void; confirm_close: boolean };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (e: { error: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Browser only'));
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export type CheckoutOutcome =
  | { kind: 'paid'; payload: VerifyPaymentInput }
  | { kind: 'dismissed' }
  | { kind: 'failed'; message: string };

/** Opens the payment window and resolves when the shopper pays, closes it or fails. */
export async function payWithRazorpay(init: PaymentInit): Promise<CheckoutOutcome> {
  await loadRazorpay();
  const Razorpay = window.Razorpay;
  if (!Razorpay) return { kind: 'failed', message: 'Payment window unavailable' };
  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const rzp = new Razorpay({
      key: init.keyId,
      amount: init.amount,
      currency: init.currency,
      order_id: init.razorpayOrderId,
      name: 'ZYVENTA',
      description: `Order ${init.orderNumber}`,
      prefill: init.prefill,
      theme: { color: '#4535c9' },
      handler: (r) => {
        finish({
          kind: 'paid',
          payload: {
            razorpayOrderId: r.razorpay_order_id,
            razorpayPaymentId: r.razorpay_payment_id,
            razorpaySignature: r.razorpay_signature,
          },
        });
      },
      modal: {
        confirm_close: true,
        ondismiss: () => {
          finish({ kind: 'dismissed' });
        },
      },
    });
    rzp.on('payment.failed', (e) => {
      finish({ kind: 'failed', message: e.error.description ?? 'Payment failed' });
    });
    rzp.open();
  });
}

export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
