/**
 * Generates a pseudonymous ID from a phone number or device ID.
 * Uses HMAC-SHA256 with SERVER_SECRET, truncated to 24 hex characters.
 * The raw identifier is never stored.
 */

import { createHmac } from "crypto";

export function makePseudonymousId(identifier: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(identifier)
    .digest("hex")
    .slice(0, 24);
}
