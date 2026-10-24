/**
 * Local persistence layer (localStorage).
 *
 * All fan interactions are stored here so the app works offline and survives
 * page reloads. The API client (lib/api.js) handles communication with the
 * backend — this file is intentionally unaware of it.
 */

const KEYS = { optins: "fandomloop_optins", orders: "fandomloop_orders" }

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || []
  } catch {
    return []
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage can be blocked in private mode; the app still works without it */
  }
}

export const getOptIns = () => read(KEYS.optins)
export const getOrders = () => read(KEYS.orders)

export function addOptIn(optin) {
  const next = [{ ...optin, at: new Date().toISOString() }, ...getOptIns()]
  write(KEYS.optins, next)
  return next
}

export function addOrder(order) {
  const next = [{ ...order, at: new Date().toISOString() }, ...getOrders()]
  write(KEYS.orders, next)
  return next
}
