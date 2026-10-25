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

/** GET /api/campaigns — returns campaigns enriched with committedCount, gateVerdict, ourRevenue */
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

/** GET /api/campaigns/:slug/sources */
export const getCampaignSources = (slug) =>
  request("GET", `/api/campaigns/${slug}/sources`)

/** GET /api/campaigns/:slug/scans */
export const getCampaignScans = (slug) =>
  request("GET", `/api/campaigns/${slug}/scans`)

/** POST /api/campaigns/:slug/settle */
export const settleCampaign = (slug) =>
  request("POST", `/api/campaigns/${slug}/settle`)

// ── Verify ────────────────────────────────────────────────────────────────

/**
 * GET /api/verify/:serial
 * Returns { verified, serial, item, batch, seller, authorized, campaign,
 *           registeredAt, scanCount, suspicious }
 *      or { verified: false, serial }
 */
export const verifySerial = (serial) =>
  request("GET", `/api/verify/${encodeURIComponent(serial.trim().toUpperCase())}`)

// ── AI ────────────────────────────────────────────────────────────────────

/** POST /api/campaigns/:slug/insights — { totalComments, method, clusters } */
export const getCampaignInsights = (slug) =>
  request("POST", `/api/campaigns/${slug}/insights`)

/** POST /api/campaigns/:slug/brief — { generatedBy, verdict, sections } */
export const getCampaignBrief = (slug) =>
  request("POST", `/api/campaigns/${slug}/brief`)

// ── Consent ───────────────────────────────────────────────────────────────

/** POST /api/consent — { pseudonymousId, consentId } */
export const recordConsent = (body) => request("POST", "/api/consent", body)

/** POST /api/consent/withdraw — { withdrawn, released, campaignsAffected } */
export const withdrawConsent = (pseudonymousId) =>
  request("POST", "/api/consent/withdraw", { pseudonymousId })

// ── Pledges ───────────────────────────────────────────────────────────────

/** POST /api/pledges — { pledge, progressPct } */
export const createPledge = (body) => request("POST", "/api/pledges", body)

/** POST /api/pledges/:id/preauthorize — { mock, pledge, mandateRef, progressPct } */
export const preauthorizePledge = (id) =>
  request("POST", `/api/pledges/${id}/preauthorize`)

/** GET /api/pledges/:id/order?pseudonymousId=... — { status, order? } */
export const getPledgeOrder = (id, pseudonymousId) =>
  request("GET", `/api/pledges/${id}/order?pseudonymousId=${encodeURIComponent(pseudonymousId)}`)

// ── Health ────────────────────────────────────────────────────────────────

export const healthCheck = () => request("GET", "/api/health")

// ── Signals / prior ───────────────────────────────────────────────────────

/**
 * GET /api/campaigns/:slug/prior
 * Returns { asOf, signalsUsed, perCity, trend, sources, _meta }
 */
export const getCampaignPrior = (slug) =>
  request("GET", `/api/campaigns/${slug}/prior`)

// ── Analysis / evaluation ─────────────────────────────────────────────────

/** GET /api/analysis/report — { dataSources, dataQuality, nlp, demand, gate, limitations } */
export const getAnalysisReport = () => request("GET", "/api/analysis/report")

/** POST /api/analysis/run — re-runs evaluation and returns fresh report */
export const runAnalysis = () => request("POST", "/api/analysis/run")

// ── Demo reset ────────────────────────────────────────────────────────────

/** POST /api/demo/reset — { reset: true, campaigns } */
export const demoReset = () => request("POST", "/api/demo/reset")

// ── Campaign reopen ───────────────────────────────────────────────────────

/** POST /api/campaigns/:slug/reopen — { campaign } */
export const reopenCampaign = (slug) =>
  request("POST", `/api/campaigns/${slug}/reopen`)
