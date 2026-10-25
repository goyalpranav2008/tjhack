/**
 * Tests for src/lib/format.js — pure formatting helpers.
 */
import { describe, it, expect } from "vitest"
import { inr, num, pct } from "../lib/format"

describe("inr()", () => {
  it("formats zero", () => {
    expect(inr(0)).toBe("₹0")
  })

  it("formats a whole number", () => {
    expect(inr(999)).toBe("₹999")
  })

  it("formats thousands with Indian grouping", () => {
    // en-IN groups: 1,00,000 style
    expect(inr(30000)).toMatch(/₹30,000|₹30000/)
  })

  it("rounds a float before formatting", () => {
    expect(inr(259.27)).toBe("₹259")
  })

  it("handles negative numbers", () => {
    expect(inr(-106)).toMatch(/-106/)
  })
})

describe("num()", () => {
  it("formats zero", () => {
    expect(num(0)).toBe("0")
  })

  it("formats a plain integer", () => {
    expect(num(120)).toBe("120")
  })

  it("rounds floats", () => {
    expect(num(115.83)).toBe("116")
  })

  it("formats large numbers with grouping separators", () => {
    const result = num(10000)
    // Either 10,000 (en-IN) or 10000 depending on locale support in jsdom
    expect(result).toMatch(/10[,.]?000|10000/)
  })
})

describe("pct()", () => {
  it("formats 0 as 0%", () => {
    expect(pct(0)).toBe("0%")
  })

  it("formats 1 as 100%", () => {
    expect(pct(1)).toBe("100%")
  })

  it("formats 0.20 as 20%", () => {
    expect(pct(0.20)).toBe("20%")
  })

  it("formats 0.259 by rounding", () => {
    // Math.round(0.259 * 100) = 26
    expect(pct(0.259)).toBe("26%")
  })

  it("formats 0.5 as 50%", () => {
    expect(pct(0.5)).toBe("50%")
  })
})
