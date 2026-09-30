import type { EmailMessage } from './mailer.js';

/** Escapes text for HTML email bodies — user-controlled values (names) are never trusted. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f6fa;font-family:Arial,Helvetica,sans-serif;color:#1f1d2b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;color:#4535c9;padding-bottom:16px">ZYVENTA</td></tr>
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:12px">${escapeHtml(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

export function emailButton(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#4535c9;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold">${escapeHtml(label)}</a></p>
<p style="font-size:13px;color:#6b6880">If the button doesn’t work, copy this link into your browser:<br>${escapeHtml(url)}</p>`;
}

export function verificationEmail(to: string, name: string, url: string): EmailMessage {
  const title = 'Confirm your email address';
  return {
    to,
    subject: 'Confirm your ZYVENTA email address',
    text: `Hi ${name},\n\nConfirm your email address to start shopping on ZYVENTA:\n${url}\n\nThis link expires in 24 hours. If you didn't create an account, ignore this email.`,
    html: emailLayout(
      title,
      `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email address to start shopping on ZYVENTA.</p>${emailButton(url, 'Confirm email')}<p style="font-size:13px;color:#6b6880">This link expires in 24 hours. If you didn’t create an account, you can ignore this email.</p>`,
    ),
  };
}

export function passwordResetEmail(to: string, name: string, url: string): EmailMessage {
  const title = 'Reset your password';
  return {
    to,
    subject: 'Reset your ZYVENTA password',
    text: `Hi ${name},\n\nUse this link to choose a new password:\n${url}\n\nThe link expires in 30 minutes and can be used once. If you didn't ask for this, ignore this email — your password stays the same.`,
    html: emailLayout(
      title,
      `<p>Hi ${escapeHtml(name)},</p><p>We received a request to reset your password.</p>${emailButton(url, 'Choose a new password')}<p style="font-size:13px;color:#6b6880">The link expires in 30 minutes and can be used once. If you didn’t ask for this, ignore this email — your password stays the same.</p>`,
    ),
  };
}

export function passwordChangedEmail(to: string, name: string, supportUrl: string): EmailMessage {
  const title = 'Your password was changed';
  return {
    to,
    subject: 'Your ZYVENTA password was changed',
    text: `Hi ${name},\n\nYour password was just changed and all other devices were signed out.\nIf this wasn't you, reset your password immediately: ${supportUrl}`,
    html: emailLayout(
      title,
      `<p>Hi ${escapeHtml(name)},</p><p>Your password was just changed and all other devices were signed out.</p><p>If this wasn’t you, reset your password immediately.</p>${emailButton(supportUrl, 'Secure my account')}`,
    ),
  };
}
