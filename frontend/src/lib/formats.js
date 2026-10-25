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
export const LANGUAGES = [
  "Hindi",
  "English",
  "Tamil",
  "Telugu",
  "Bengali",
  "Other language",
]

// ── Formats ───────────────────────────────────────────────────────────────
export const FORMAT_TO_BACKEND = {
  "Merch":         "TEE",
  "Digital manga": "CHAPTER",
  "Event ticket":  "EVENT",
  "Poster":        "POSTER",
}

export const FORMAT_TO_LABEL = Object.fromEntries(
  Object.entries(FORMAT_TO_BACKEND).map(([label, val]) => [val, label])
)

export const FORMAT_LABELS = ["Merch", "Digital manga", "Event ticket"]

// ── Price bands ───────────────────────────────────────────────────────────
export const PRICE_BANDS = ["Under ₹150", "₹150 to ₹499", "₹500 to ₹899", "₹900 and above"]

export const PRICE_BAND_TO_AMOUNT = {
  "Under ₹150":      99,
  "₹150 to ₹499":   299,
  "₹500 to ₹899":   699,
  "₹900 and above": 999,
}

// ── Platform options (anime streaming services) ───────────────────────────
export const PLATFORM_OPTIONS = [
  { value: "netflix",    label: "Netflix" },
  { value: "crunchyroll", label: "Crunchyroll" },
  { value: "prime-video", label: "Prime Video" },
  { value: "youtube",    label: "YouTube" },
  { value: "other",      label: "Other" },
]

// ── Default campaign slug used by the fan-facing app ─────────────────────
export const DEFAULT_CAMPAIGN_SLUG = "monsoon-samurai-tee"
export const DEFAULT_CAMPAIGN_TITLE = "Monsoon Samurai"

// ── Source validation regex (matches backend constraint) ─────────────────
export const SOURCE_RE = /^[a-z0-9-]{1,40}$/
