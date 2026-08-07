import nodemailer from 'nodemailer';
import { env, isEmailConfigured } from './env.js';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: false, // STARTTLS on port 587, not implicit TLS
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

/** Silently no-ops when SMTP isn't configured, so email-dependent features degrade
 * gracefully in dev/test instead of throwing — callers that need to know whether the
 * email actually went out should check isEmailConfigured() themselves beforehand. */
export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!isEmailConfigured()) return;
  await getTransporter().sendMail({
    from: env.smtp.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}

export function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  return sendMail({
    to,
    subject: 'Reset your Shadow Tasks password',
    html: `
      <p>A password reset was requested for your Shadow Tasks account.</p>
      <p><a href="${resetUrl}">Click here to choose a new password</a>. This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}
