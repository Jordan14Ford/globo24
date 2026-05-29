/**
 * Reduces HTML byte size for email clients (Gmail clips ~102KB).
 * Safe: only removes whitespace between tags, not inside text nodes.
 */
export function compactEmailHtml(html: string): string {
  return html.replace(/>\s+</g, "><");
}
