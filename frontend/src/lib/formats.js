/**
 * Single source of truth for cities, languages, and format mappings.
 *
 * Backend enum values (TEE | POSTER | CHAPTER | EVENT) are what the API stores.
 * Frontend labels (Merch | Digital manga | Event ticket) are what fans see.
 *
 * Any change to valid cities, languages, or format mappings should be made here
 * AND in backend/src/routes/pledges.ts (VALID_CITIES / VALID_LANGUAGES / VALID_FORMATS).
 */

// ── Cities ────────────────────────────────────────────────────────────────
// Must match VALID_CITIES in backend/src/routes/pledges.ts
export const CITIES = [
  "Delhi NCR",
  "Bengaluru",
  "Mumbai",
  "Pune",
  "Chennai",
  "Hyderabad",
  "Kolkata",
  "Jaipur",
  "Other city",
]

// ── Languages ─────────────────────────────────────────────────────────────
// Must match VALID_LANGUAGES in backend/src/routes/pledges.ts
export const LANGUAGES = [
  "Hindi",
  "English",
  "Tamil",
  "Telugu",
  "Bengali",
  "Other language",
]

// ── Formats ───────────────────────────────────────────────────────────────
// Frontend label → backend enum value
// Must match VALID_FORMATS in backend/src/routes/pledges.ts
export const FORMAT_TO_BACKEND = {
  "Merch":         "TEE",
  "Digital manga": "CHAPTER",
  "Event ticket":  "EVENT",
  "Poster":        "POSTER",
}

// Backend enum value → frontend display label
export const FORMAT_TO_LABEL = Object.fromEntries(
  Object.entries(FORMAT_TO_BACKEND).map(([label, val]) => [val, label])
)

// Ordered list of frontend format labels shown to fans
export const FORMAT_LABELS = ["Merch", "Digital manga", "Event ticket"]

// ── Price bands ───────────────────────────────────────────────────────────
export const PRICE_BANDS = ["Under ₹150", "₹150 to ₹499", "₹500 to ₹899", "₹900 and above"]

// Map each price band to a representative rupee amount sent to the backend
export const PRICE_BAND_TO_AMOUNT = {
  "Under ₹150":      99,
  "₹150 to ₹499":   299,
  "₹500 to ₹899":   699,
  "₹900 and above": 999,
}
