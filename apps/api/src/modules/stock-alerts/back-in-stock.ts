import type { Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import { orderUpdateEmail } from '../email/commerce-templates.js';
import { Notification } from '../notifications/notification.model.js';
import { queueEmail } from '../notifications/notification.service.js';
import { Product } from '../products/product.model.js';
import { StockAlert } from './stock-alert.model.js';

const BATCH = 500;

/**
 * Called after a variant's available stock goes from 0 to > 0. Each ACTIVE alert is claimed
 * atomically (ACTIVE → NOTIFIED with this run's timestamp) before its notification is created,
 * so concurrent restocks can never notify the same subscriber twice.
 * Subscribers who allow stock-alert emails also get an email.
 */
export async function notifyBackInStock(variantId: Types.ObjectId): Promise<number> {
  const claimedAt = new Date();
  let notified = 0;

  for (;;) {
    const candidates = await StockAlert.find({ variant: variantId, status: 'ACTIVE' })
      .select('_id')
      .limit(BATCH)
      .lean();
    if (candidates.length === 0) break;

    await StockAlert.updateMany(
      { _id: { $in: candidates.map((c) => c._id) }, status: 'ACTIVE' },
      { $set: { status: 'NOTIFIED', notifiedAt: claimedAt } },
    );
    const claimed = await StockAlert.find({
      _id: { $in: candidates.map((c) => c._id) },
      notifiedAt: claimedAt,
    })
      .select('user product')
      .lean();
    if (claimed.length === 0) break;

    const product = await Product.findById(claimed[0]?.product).select('name slug').lean();
    if (!product) break;

    await Notification.insertMany(
      claimed.map((alert) => ({
        user: alert.user,
        type: 'BACK_IN_STOCK',
        title: 'Back in stock',
        body: `${product.name} is available again. Grab it before it sells out.`,
        link: `/products/${product.slug}`,
        meta: { productSlug: product.slug },
        dedupeKey: `back-in-stock:${variantId.toString()}:${String(claimedAt.getTime())}`,
      })),
      { ordered: false },
    ).catch((error: unknown) => {
      logger.warn({ reason: String(error) }, 'Some back-in-stock notifications were not created');
    });
    for (const alert of claimed) {
      queueEmail(alert.user, {
        preference: 'stockAlerts',
        build: (to) =>
          orderUpdateEmail({
            to: to.email,
            name: to.name,
            subject: `Back in stock: ${product.name}`,
            headline: 'It’s back in stock',
            message: `${product.name} is available again. Stock is limited, so grab it before it sells out.`,
            path: `/products/${product.slug}`,
            cta: 'View product',
          }),
      });
    }
    notified += claimed.length;
    if (candidates.length < BATCH) break;
  }

  if (notified > 0)
    logger.info({ variantId: variantId.toString(), notified }, 'Back-in-stock alerts sent');
  return notified;
}
