/**
 * PII scrubbing for comment text.
 *
 * Removes before storing:
 *   - Email addresses  → [email]
 *   - @handles         → [handle]
 *   - 10+ digit runs   → [redacted]  (covers Indian mobile numbers, Aadhaar-style IDs, etc.)
 *
 * Returns the cleaned text. The original is never stored.
 */

// 10 or more consecutive digits anywhere in the string
const DIGITS_10_PLUS_RE = /\d{10,}/g;
// Standard email addresses
const EMAIL_RE          = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
// Social/platform handles
const HANDLE_RE         = /@[a-zA-Z0-9_]{1,50}/g;

export function scrubPII(text: string): string {
  return text
    .replace(EMAIL_RE,          "[email]")
    .replace(HANDLE_RE,         "[handle]")
    .replace(DIGITS_10_PLUS_RE, "[redacted]");
}
