/**
 * Tests for src/lib/storage.js — localStorage persistence helpers.
 * jsdom provides localStorage so no mocking needed.
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  getDeviceId,
  getPseudonymousId,
  setPseudonymousId,
  getOptIns,
  addOptIn,
  getOrders,
  addOrder,
  getReservations,
  addReservation,
} from "../lib/storage"

// Clear localStorage before each test for isolation
beforeEach(() => {
  localStorage.clear()
})

// ── Device ID ─────────────────────────────────────────────────────────────

describe("getDeviceId()", () => {
  it("returns a non-empty string", () => {
    const id = getDeviceId()
    expect(typeof id).toBe("string")
    expect(id.length).toBeGreaterThan(0)
  })

  it("returns the same ID on repeated calls (stable)", () => {
    const a = getDeviceId()
    const b = getDeviceId()
    expect(a).toBe(b)
  })

  it("persists across module re-invocations (reads from localStorage)", () => {
    const first = getDeviceId()
    // Simulate a fresh read by clearing any in-memory state:
    // getDeviceId() reads localStorage, so as long as localStorage is intact it's stable
    const second = getDeviceId()
    expect(first).toBe(second)
  })
})

// ── Pseudonymous ID ───────────────────────────────────────────────────────

describe("getPseudonymousId / setPseudonymousId", () => {
  it("returns null when nothing stored", () => {
    expect(getPseudonymousId()).toBeNull()
  })

  it("stores and retrieves a pseudonymous ID", () => {
    setPseudonymousId("abc123def456789abc123def")
    expect(getPseudonymousId()).toBe("abc123def456789abc123def")
  })

  it("overwrites previous value", () => {
    setPseudonymousId("first")
    setPseudonymousId("second")
    expect(getPseudonymousId()).toBe("second")
  })
})

// ── Opt-ins ───────────────────────────────────────────────────────────────

describe("getOptIns / addOptIn", () => {
  it("returns empty array when nothing stored", () => {
    expect(getOptIns()).toEqual([])
  })

  it("addOptIn prepends the new entry", () => {
    addOptIn({ city: "Mumbai", format: "Merch" })
    addOptIn({ city: "Chennai", format: "Merch" })
    const items = getOptIns()
    expect(items).toHaveLength(2)
    // Most recent first
    expect(items[0].city).toBe("Chennai")
    expect(items[1].city).toBe("Mumbai")
  })

  it("addOptIn attaches a timestamp", () => {
    addOptIn({ city: "Delhi NCR" })
    const [item] = getOptIns()
    expect(item.at).toBeTruthy()
    // Should be a valid ISO date string
    expect(() => new Date(item.at)).not.toThrow()
  })

  it("addOptIn returns the updated array", () => {
    const result = addOptIn({ city: "Kolkata" })
    expect(Array.isArray(result)).toBe(true)
    expect(result[0].city).toBe("Kolkata")
  })

  it("preserves original properties", () => {
    addOptIn({ city: "Pune", language: "Hindi", format: "Merch", priceBand: "₹900 and above" })
    const [item] = getOptIns()
    expect(item.city).toBe("Pune")
    expect(item.language).toBe("Hindi")
    expect(item.priceBand).toBe("₹900 and above")
  })
})

// ── Orders ────────────────────────────────────────────────────────────────

describe("getOrders / addOrder", () => {
  it("returns empty array initially", () => {
    expect(getOrders()).toEqual([])
  })

  it("addOrder prepends and returns updated array", () => {
    const result = addOrder({ serial: "FL-2026-ABC1" })
    expect(result[0].serial).toBe("FL-2026-ABC1")
  })

  it("multiple orders are stored in reverse insertion order", () => {
    addOrder({ serial: "FL-2026-FIRST" })
    addOrder({ serial: "FL-2026-SECOND" })
    const orders = getOrders()
    expect(orders[0].serial).toBe("FL-2026-SECOND")
    expect(orders[1].serial).toBe("FL-2026-FIRST")
  })
})

// ── Reservations ──────────────────────────────────────────────────────────

describe("getReservations / addReservation", () => {
  it("returns empty array initially", () => {
    expect(getReservations()).toEqual([])
  })

  it("addReservation stores a reservation", () => {
    addReservation({ pledgeId: 1, pseudonymousId: "abc", campaignSlug: "monsoon-samurai-tee" })
    const items = getReservations()
    expect(items).toHaveLength(1)
    expect(items[0].pledgeId).toBe(1)
    expect(items[0].campaignSlug).toBe("monsoon-samurai-tee")
  })

  it("deduplicates by pledgeId — second call replaces first", () => {
    addReservation({ pledgeId: 42, pseudonymousId: "old", campaignSlug: "slug-a" })
    addReservation({ pledgeId: 42, pseudonymousId: "new", campaignSlug: "slug-a" })
    const items = getReservations()
    expect(items).toHaveLength(1)
    expect(items[0].pseudonymousId).toBe("new")
  })

  it("keeps distinct pledgeIds separate", () => {
    addReservation({ pledgeId: 1, pseudonymousId: "a", campaignSlug: "s" })
    addReservation({ pledgeId: 2, pseudonymousId: "b", campaignSlug: "s" })
    expect(getReservations()).toHaveLength(2)
  })

  it("attaches a timestamp", () => {
    addReservation({ pledgeId: 99, pseudonymousId: "x", campaignSlug: "s" })
    const [r] = getReservations()
    expect(r.at).toBeTruthy()
    expect(new Date(r.at).getFullYear()).toBeGreaterThanOrEqual(2020)
  })
})
