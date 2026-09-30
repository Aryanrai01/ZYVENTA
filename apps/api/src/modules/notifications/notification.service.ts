import type { NotificationType } from '@zyventa/shared';
import type { ClientSession, Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import type { EmailMessage } from '../email/mailer.js';
import { sendEmailInBackground } from '../email/mailer.js';
import { User } from '../users/user.model.js';
import { Notification } from './notification.model.js';

export type EmailPreference = 'orderUpdates' | 'stockAlerts' | 'promotions' | 'securityAlerts';

export interface NotifyInput {
  user: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  body?: string;
  /** Relative in-app path only. */
  link?: string | null;
  meta?: Record<string, string>;
  dedupeKey?: string;
  /** Optional email, sent only when the user's preference allows it. */
  email?: {
    preference: EmailPreference;
    build: (recipient: { email: string; name: string }) => EmailMessage;
  };
}

/**
 * Creates an in-app notification and (optionally) an email, honouring the user's email
 * preferences. Never throws into the caller: a failed notification must not undo an order.
 * Pass `session` to create the in-app notification inside the caller's transaction.
 */
export async function notify(input: NotifyInput, session?: ClientSession): Promise<void> {
  try {
    await Notification.create(
      [
        {
          user: input.user,
          type: input.type,
          title: input.title,
          body: input.body ?? '',
          link: input.link ?? null,
          meta: input.meta ?? {},
          dedupeKey: input.dedupeKey ?? null,
        },
      ],
      session ? { session } : {},
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return; // already sent (dedupe key)
    if (session) throw error; // let the transaction decide
    logger.warn({ reason: String(error), type: input.type }, 'Notification not created');
    return;
  }
  if (input.email) queueEmail(input.user, input.email);
}

export function queueEmail(
  userId: Types.ObjectId | string,
  email: NonNullable<NotifyInput['email']>,
): void {
  void (async () => {
    const user = await User.findById(userId)
      .select('email name notificationPreferences status')
      .lean();
    if (!user || user.status !== 'ACTIVE') return;
    const allowed =
      email.preference === 'securityAlerts' || user.notificationPreferences[email.preference];
    if (!allowed) return;
    sendEmailInBackground(email.build({ email: user.email, name: user.name }));
  })().catch((error: unknown) => {
    logger.warn({ reason: String(error) }, 'Notification email not sent');
  });
}
