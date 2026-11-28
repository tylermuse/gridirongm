import { EMAIL_FROM, EMAIL_REPLY_TO, unsubscribeOneClickUrl } from './config';

/**
 * Minimal Resend client (https://resend.com/docs/api-reference/emails/send-email).
 * Uses fetch so the app needs no extra dependency.
 */

export type SendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The recipient's email_prefs.token, for the List-Unsubscribe headers. */
  unsubscribeToken: string;
  /** Same key on a retry means Resend will not send a second copy. */
  idempotencyKey: string;
  campaign: string;
};

export type SendResult = { ok: true; id: string } | { ok: false; status: number; error: string };

export async function sendViaResend(input: SendInput, apiKey: string): Promise<SendResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [input.to],
        reply_to: EMAIL_REPLY_TO,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: {
          // Lets Gmail and Apple Mail show their own Unsubscribe button (RFC 8058).
          'List-Unsubscribe': `<${unsubscribeOneClickUrl(input.unsubscribeToken)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [{ name: 'campaign', value: input.campaign }],
      }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) {
      return { ok: false, status: res.status, error: body.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'network error' };
  }
}
