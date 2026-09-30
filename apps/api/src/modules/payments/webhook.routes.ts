import { createHash } from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { logger } from '../../config/logger.js';
import type { CheckoutService } from '../checkout/checkout.service.js';
import type { PaymentGateway, RazorpayPayment, RazorpayRefund } from './razorpay.client.js';
import type { RefundService } from './refund.service.js';
import { WebhookEvent } from './webhook-event.model.js';

interface RazorpayEvent {
  event: string;
  payload?: {
    payment?: { entity?: RazorpayPayment };
    refund?: { entity?: RazorpayRefund };
    order?: { entity?: { id: string } };
  };
}

/**
 * POST /api/v1/webhooks/razorpay — mounted BEFORE the JSON parser (raw body needed for the
 * HMAC). Flow: verify signature → dedupe by event id (unique index) → process → record.
 * Replays and duplicate deliveries are no-ops; a processing error returns 500 so Razorpay
 * retries, and the FAILED record lets that retry through.
 */
export function createWebhookRouter(deps: {
  gateway: PaymentGateway | null;
  checkout: CheckoutService;
  refunds: RefundService;
}): Router {
  const router = Router();

  router.post(
    '/razorpay',
    express.raw({ type: 'application/json', limit: '256kb' }),
    async (req: Request, res: Response) => {
      const signature = req.get('X-Razorpay-Signature') ?? '';
      const body = req.body as unknown;
      if (
        !deps.gateway ||
        !Buffer.isBuffer(body) ||
        !deps.gateway.verifyWebhookSignature(body, signature)
      ) {
        logger.warn({ ip: req.ip }, 'Rejected Razorpay webhook (bad or missing signature)');
        res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Invalid signature' });
        return;
      }

      let event: RazorpayEvent;
      try {
        event = JSON.parse(body.toString('utf8')) as RazorpayEvent;
      } catch {
        res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Invalid payload' });
        return;
      }
      const eventId =
        req.get('X-Razorpay-Event-Id') ?? createHash('sha256').update(body).digest('hex');
      const payment = event.payload?.payment?.entity;
      const refund = event.payload?.refund?.entity;

      try {
        await WebhookEvent.create({
          provider: 'RAZORPAY',
          eventId,
          type: event.event.slice(0, 100),
          entityIds: {
            razorpayOrderId: payment?.order_id ?? event.payload?.order?.entity?.id ?? null,
            razorpayPaymentId: payment?.id ?? refund?.payment_id ?? null,
            razorpayRefundId: refund?.id ?? null,
          },
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const existing = await WebhookEvent.findOne({ provider: 'RAZORPAY', eventId }).lean();
        if (existing?.status !== 'FAILED') {
          res.json({ success: true, message: 'Duplicate event ignored', data: null });
          return;
        }
      }

      try {
        let handled = true;
        switch (event.event) {
          case 'payment.captured':
          case 'order.paid':
            if (payment?.status === 'captured')
              await deps.checkout.confirmPayment(payment, 'WEBHOOK');
            else handled = false;
            break;
          case 'payment.failed':
            if (payment) await deps.checkout.paymentFailed(payment);
            break;
          case 'refund.processed':
          case 'refund.failed':
            if (refund) await deps.refunds.onGatewayEvent(refund);
            break;
          default:
            handled = false;
        }
        await WebhookEvent.updateOne(
          { provider: 'RAZORPAY', eventId },
          {
            $set: {
              status: handled ? 'PROCESSED' : 'IGNORED',
              processedAt: new Date(),
              error: null,
            },
          },
        );
        res.json({ success: true, message: 'OK', data: null });
      } catch (error) {
        logger.error(
          { eventId, type: event.event, reason: String(error) },
          'Webhook processing failed',
        );
        await WebhookEvent.updateOne(
          { provider: 'RAZORPAY', eventId },
          { $set: { status: 'FAILED', error: String(error).slice(0, 1000) } },
        );
        res
          .status(500)
          .json({ success: false, code: 'INTERNAL_ERROR', message: 'Processing failed' });
      }
    },
  );

  return router;
}
