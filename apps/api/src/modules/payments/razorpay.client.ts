import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { hmacSha256Hex, safeHexEqual } from '../../utils/crypto.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Minimal Razorpay REST client (orders, payments, refunds) over fetch with HTTP basic auth.
 * The key secret is used only here, server-side; it is never logged or sent to browsers.
 */
export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: 'created' | 'attempted' | 'paid';
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string | null;
  captured: boolean;
  card?: { network?: string | null; last4?: string | null } | null;
  bank?: string | null;
  wallet?: string | null;
  error_code?: string | null;
  error_description?: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
}

export interface PaymentGateway {
  readonly keyId: string;
  createOrder(input: {
    amount: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RazorpayOrder>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
  capturePayment(paymentId: string, amount: number): Promise<RazorpayPayment>;
  refund(
    paymentId: string,
    input: { amount: number; receipt: string; notes: Record<string, string> },
  ): Promise<RazorpayRefund>;
  /** Checkout callback signature: HMAC(order_id|payment_id, key secret). */
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean;
  /** Webhook signature: HMAC(raw body, webhook secret). */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

class RazorpayHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createRazorpayGateway(): PaymentGateway | null {
  const keyId = env.RAZORPAY_KEY_ID;
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) return null;
  const authorization = `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`;

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${env.RAZORPAY_API_URL}${path}`, {
        method,
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      logger.error({ reason: String(error), path }, 'Razorpay unreachable');
      throw ApiError.serviceUnavailable('Payment provider is unreachable. Please try again.');
    }
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; description?: string };
    };
    if (!response.ok) {
      const code = payload.error?.code ?? 'UNKNOWN';
      logger.warn({ status: response.status, code, path }, 'Razorpay request failed');
      throw new RazorpayHttpError(
        response.status,
        code,
        payload.error?.description ?? 'Payment provider error',
      );
    }
    return payload as T;
  }

  return {
    keyId,
    createOrder: (input) =>
      call<RazorpayOrder>('POST', '/orders', {
        amount: input.amount,
        currency: 'INR',
        receipt: input.receipt,
        notes: input.notes,
        payment_capture: 1,
      }),
    fetchPayment: (paymentId) =>
      call<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`),
    capturePayment: (paymentId, amount) =>
      call<RazorpayPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, {
        amount,
        currency: 'INR',
      }),
    refund: (paymentId, input) =>
      call<RazorpayRefund>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: input.amount,
        receipt: input.receipt,
        notes: input.notes,
        speed: 'normal',
      }),
    verifyCheckoutSignature: (orderId, paymentId, signature) =>
      safeHexEqual(hmacSha256Hex(secret, `${orderId}|${paymentId}`), signature),
    verifyWebhookSignature: (rawBody, signature) => {
      if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
      return safeHexEqual(hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
    },
  };
}

export function requireGateway(gateway: PaymentGateway | null): PaymentGateway {
  if (!gateway) {
    throw ApiError.serviceUnavailable(
      'Online payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in apps/api/.env',
    );
  }
  return gateway;
}

export { RazorpayHttpError };
