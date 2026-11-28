import { FOOTER_ADDRESS, FOOTER_COMPANY } from './config';

/**
 * Shared shell for marketing emails: light background, single 560px column,
 * table layout and inline styles so it renders the same in Gmail, Apple Mail
 * and Outlook.
 */

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function paragraph(html: string): string {
  return `<p style="margin-top:0;margin-right:0;margin-bottom:16px;margin-left:0;font-family:${FONT};font-size:16px;line-height:24px;color:#1f2937;">${html}</p>`;
}

export function bulletList(items: string[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr><td valign="top" style="padding-top:0;padding-right:10px;padding-bottom:8px;padding-left:0;font-family:${FONT};font-size:16px;line-height:24px;color:#2563eb;">&bull;</td><td valign="top" style="padding-top:0;padding-right:0;padding-bottom:8px;padding-left:0;font-family:${FONT};font-size:16px;line-height:24px;color:#1f2937;">${item}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">${rows}</table>`;
}

export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;margin-bottom:24px;"><tr><td bgcolor="#2563eb" style="background-color:#2563eb;border-radius:8px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding-top:12px;padding-right:22px;padding-bottom:12px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

/** A full-width image inside the card, linked to `href`. `src` must be an absolute URL. */
export function image(opts: { src: string; alt: string; href: string; width: number; height: number }): string {
  const { src, alt, href, width, height } = opts;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;"><tr><td><a href="${escapeHtml(href)}" style="text-decoration:none;"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${width}" height="${height}" border="0" style="display:block;width:100%;max-width:${width}px;height:auto;border-radius:8px;"></a></td></tr></table>`;
}

export function renderLayout(opts: { preheader: string; bodyHtml: string; unsubscribeUrl: string }): string {
  const { preheader, bodyHtml, unsubscribeUrl } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>BS Football</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f4f6;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding-top:24px;padding-right:12px;padding-bottom:24px;padding-left:12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td style="padding-top:0;padding-right:4px;padding-bottom:12px;padding-left:4px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:#111827;">BS Football</td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding-top:28px;padding-right:28px;padding-bottom:12px;padding-left:28px;">
${bodyHtml}
</td></tr>
<tr><td style="padding-top:16px;padding-right:4px;padding-bottom:0;padding-left:4px;font-family:${FONT};font-size:12px;line-height:18px;color:#6b7280;">
You're getting this because you have a BS Football account. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a><br>
${escapeHtml(FOOTER_COMPANY)}, ${escapeHtml(FOOTER_ADDRESS)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function textFooter(unsubscribeUrl: string): string {
  return [
    '--',
    "You're getting this because you have a BS Football account.",
    `Unsubscribe: ${unsubscribeUrl}`,
    `${FOOTER_COMPANY}, ${FOOTER_ADDRESS}`,
  ].join('\n');
}
