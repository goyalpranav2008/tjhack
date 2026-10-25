/**
 * Local persistence layer (localStorage).
 *
 * All fan interactions are stored here so the app works offline and survives
 * page reloads. The API client (lib/api.js) handles communication with the
 * backend — this file is intentionally unaware of it.
 */

const KEYS = {
  optins: "fandomloop_optins",
  orders: "fandomloop_orders",
  deviceId: "fandomloop_device_id",
  pseudonymousId: "fandomloop_pseudonymous_id",
  reservations: "fandomloop_reservations",
}

// ── In-memory fallback (private/incognito with storage blocked) ────────────
let _deviceId = null

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || []
  } catch {
    return []
  }
}

function readOne(key) {
  try {
    return localStorage.getItem(key) || null
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage can be blocked in private mode; the app still works without it */
  }
}

function writeOne(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignored */
  }
}

// ── Device ID — stable anonymous identifier ────────────────────────────────
/**
 * Returns a stable device ID stored in localStorage.
 * Created once using crypto.randomUUID() and never changes.
 * Falls back to an in-memory value if storage is blocked.
 */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEYS.deviceId)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEYS.deviceId, id)
    }
    return id
  } catch {
    // Storage blocked — use in-memory value (stable for the tab session)
    if (!_deviceId) _deviceId = crypto.randomUUID()
    return _deviceId
  }
}

// ── Pseudonymous ID — returned by the backend after consent ───────────────
export function getPseudonymousId() {
  return readOne(KEYS.pseudonymousId)
}

export function setPseudonymousId(id) {
  writeOne(KEYS.pseudonymousId, id)
}

// ── Opt-ins ───────────────────────────────────────────────────────────────
export const getOptIns = () => read(KEYS.optins)

export function addOptIn(optin) {
  const next = [{ ...optin, at: new Date().toISOString() }, ...getOptIns()]
  write(KEYS.optins, next)
  return next
}

// ── Orders (legacy local store) ───────────────────────────────────────────
export const getOrders = () => read(KEYS.orders)

export function addOrder(order) {
  const next = [{ ...order, at: new Date().toISOString() }, ...getOrders()]
  write(KEYS.orders, next)
  return next
}

// ── Reservations — pledge IDs saved after preauthorize ────────────────────
/**
 * A reservation is: { pledgeId, pseudonymousId, campaignSlug, at }
 */
export function getReservations() {
  return read(KEYS.reservations)
}

export function addReservation(reservation) {
  const existing = getReservations()
  // Deduplicate by pledgeId
  const filtered = existing.filter((r) => r.pledgeId !== reservation.pledgeId)
  const next = [{ ...reservation, at: new Date().toISOString() }, ...filtered]
  write(KEYS.reservations, next)
  return next
}
