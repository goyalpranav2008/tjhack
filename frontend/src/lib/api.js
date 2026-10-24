/**
 * Thin API client for the FandomLoop backend.
 *
 * When VITE_API_URL is empty the Vite dev-server proxy forwards /api/* to
 * http://localhost:4000, so relative paths work in development. In production
 * set VITE_API_URL to the deployed backend origin (no trailing slash).
 */

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "")

// Studio key — set at runtime from the Console UI and stored in sessionStorage
export function getStudioKey() {
  return sessionStorage.getItem("studio_key") ?? ""
}
export function setStudioKey(key) {
  if (key) sessionStorage.setItem("studio_key", key)
  else sessionStorage.removeItem("studio_key")
}

async function request(method, path, body, extraHeaders = {}) {
  const studioKey = getStudioKey()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(studioKey ? { "X-Studio-Key": studioKey } : {}),
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      json?.error ?? json?.message ?? `HTTP ${res.status} ${res.statusText}`
    const err = new Error(message)
    err.status = res.status
    err.data = json
    throw err
  }

  return json
}

// ── Campaigns ─────────────────────────────────────────────────────────────

/** GET /api/campaigns — returns campaigns enriched with pledgeCount + gateVerdict */
export const getCampaigns = () => request("GET", "/api/campaigns")

/** GET /api/campaigns/:slug */
export const getCampaign = (slug) => request("GET", `/api/campaigns/${slug}`)

/** POST /api/campaigns */
export const createCampaign = (body) => request("POST", "/api/campaigns", body)

/** POST /api/campaigns/evaluate-gate */
export const evaluateGate = (body) =>
  request("POST", "/api/campaigns/evaluate-gate", body)

/** GET /api/campaigns/:slug/segments */
export const getCampaignSegments = (slug) =>
  request("GET", `/api/campaigns/${slug}/segments`)

/** POST /api/campaigns/:slug/settle */
export const settleCampaign = (slug) =>
  request("POST", `/api/campaigns/${slug}/settle`)

// ── Orders ────────────────────────────────────────────────────────────────

/**
 * POST /api/orders
 * Returns { serial, itemName, batch, seller, authorized, registeredAt }
 */
export const createOrder = (body) => request("POST", "/api/orders", body)

/**
 * GET /api/verify/:serial
 * Returns { verified: true, serial, item, batch, seller, authorized, campaign, registeredAt }
 *      or { verified: false }
 */
export const verifySerial = (serial) =>
  request("GET", `/api/verify/${encodeURIComponent(serial.trim().toUpperCase())}`)

// ── AI ────────────────────────────────────────────────────────────────────

/**
 * POST /api/campaigns/:slug/insights
 * Returns { totalComments, method, clusters }
 */
export const getCampaignInsights = (slug) =>
  request("POST", `/api/campaigns/${slug}/insights`)

/**
 * POST /api/campaigns/:slug/brief
 * Returns { generatedBy, verdict, sections }
 */
export const getCampaignBrief = (slug) =>
  request("POST", `/api/campaigns/${slug}/brief`)

// ── Consent ───────────────────────────────────────────────────────────────

/**
 * POST /api/consent
 * Returns { pseudonymousId, consentId }
 */
export const recordConsent = (body) => request("POST", "/api/consent", body)

// ── Pledges ───────────────────────────────────────────────────────────────

/**
 * POST /api/pledges
 * Returns { pledge, progressPct }
 */
export const createPledge = (body) => request("POST", "/api/pledges", body)

/**
 * POST /api/pledges/:id/preauthorize
 * Returns { mock, pledge, mandateRef, note }
 */
export const preauthorizePledge = (id) =>
  request("POST", `/api/pledges/${id}/preauthorize`)

// ── Health ────────────────────────────────────────────────────────────────

export const healthCheck = () => request("GET", "/api/health")
