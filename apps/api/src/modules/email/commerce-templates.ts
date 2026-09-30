import { env } from '../../config/env.js';
import type { EmailMessage } from './mailer.js';
import { emailLayout, escapeHtml, emailButton } from './templates.js';

const rupees = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100);

const link = (path: string) => `${env.WEB_APP_URL}${path}`;

export interface OrderEmailItem {
  name: string;
  quantity: number;
  lineTotal: number;
}

export function orderConfirmedEmail(input: {
  to: string;
  name: string;
  orderNumber: string;
  orderId: string;
  total: number;
  items: OrderEmailItem[];
}): EmailMessage {
  const rows = input.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${escapeHtml(i.name)} × ${String(i.quantity)}</td><td style="padding:6px 0;text-align:right">${rupees(i.lineTotal)}</td></tr>`,
    )
    .join('');
  const url = link(`/orders/${input.orderId}`);
  return {
    to: input.to,
    subject: `Order ${input.orderNumber} confirmed`,
    text: `Hi ${input.name},\n\nThanks for your order ${input.orderNumber}. We've received your payment of ${rupees(input.total)}.\n\n${input.items.map((i) => `${i.name} × ${String(i.quantity)} — ${rupees(i.lineTotal)}`).join('\n')}\n\nTrack it here: ${url}`,
    html: emailLayout(
      'Thanks for your order!',
      `<p>Hi ${escapeHtml(input.name)},</p><p>Your order <strong>${escapeHtml(input.orderNumber)}</strong> is confirmed and your payment of <strong>${rupees(input.total)}</strong> was received.</p><table role="presentation" width="100%" style="border-top:1px solid #e6e6ef;margin-top:12px">${rows}</table>${emailButton(url, 'Track your order')}`,
    ),
  };
}

/** Generic status-update email used for shipped / delivered / cancelled / refunded. */
export function orderUpdateEmail(input: {
  to: string;
  name: string;
  subject: string;
  headline: string;
  message: string;
  path: string;
  cta: string;
}): EmailMessage {
  const url = link(input.path);
  return {
    to: input.to,
    subject: input.subject,
    text: `Hi ${input.name},\n\n${input.message}\n\n${url}`,
    html: emailLayout(
      input.headline,
      `<p>Hi ${escapeHtml(input.name)},</p><p>${escapeHtml(input.message)}</p>${emailButton(url, input.cta)}`,
    ),
  };
}

export { rupees as formatRupees };
