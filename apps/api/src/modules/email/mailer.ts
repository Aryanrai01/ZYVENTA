import nodemailer, { type Transporter } from 'nodemailer';
import { env, isTest } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Messages "sent" during tests, for assertions. Always empty outside NODE_ENV=test. */
export const testOutbox: EmailMessage[] = [];

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } } : {}),
    // Never downgrade: if the server offers STARTTLS it must succeed in production.
    requireTLS: env.NODE_ENV === 'production' && !env.SMTP_SECURE,
  });
  return transporter;
}

/**
 * Sends an email. Failures are logged, never thrown into request handlers: an unreachable
 * mail server must not turn "forgot password" into a 500 (or leak timing information).
 * Phase 10 moves delivery onto a BullMQ queue with retries.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (isTest) {
    testOutbox.push(message);
    return;
  }
  try {
    await getTransporter().sendMail({ from: env.EMAIL_FROM, ...message });
  } catch (error) {
    logger.error(
      { reason: error instanceof Error ? error.message : String(error), subject: message.subject },
      'Email delivery failed',
    );
  }
}

/** Fire-and-forget variant: the HTTP response does not wait for SMTP. */
export function sendEmailInBackground(message: EmailMessage): void {
  void sendEmail(message);
}
