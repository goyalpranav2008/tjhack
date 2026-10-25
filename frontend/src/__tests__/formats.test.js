/**
 * Tests for src/lib/formats.js — constants, mappings, and validation regex.
 */
import { describe, it, expect } from "vitest"
import {
  CITIES,
  LANGUAGES,
  FORMAT_TO_BACKEND,
  FORMAT_TO_LABEL,
  FORMAT_LABELS,
  PRICE_BANDS,
  PRICE_BAND_TO_AMOUNT,
  PLATFORM_OPTIONS,
  DEFAULT_CAMPAIGN_SLUG,
  SOURCE_RE,
} from "../lib/formats"

describe("CITIES", () => {
  it("contains 9 entries", () => {
    expect(CITIES).toHaveLength(9)
  })

  it("includes the four major metros", () => {
    expect(CITIES).toContain("Delhi NCR")
    expect(CITIES).toContain("Mumbai")
    expect(CITIES).toContain("Bengaluru")
    expect(CITIES).toContain("Chennai")
  })

  it("ends with Other city as a catch-all", () => {
    expect(CITIES[CITIES.length - 1]).toBe("Other city")
  })
})

describe("LANGUAGES", () => {
  it("contains 6 entries", () => {
    expect(LANGUAGES).toHaveLength(6)
  })

  it("includes all four major regional languages", () => {
    expect(LANGUAGES).toContain("Hindi")
    expect(LANGUAGES).toContain("Tamil")
    expect(LANGUAGES).toContain("Telugu")
    expect(LANGUAGES).toContain("Bengali")
  })
})

describe("FORMAT_TO_BACKEND", () => {
  it("maps Merch → TEE", () => {
    expect(FORMAT_TO_BACKEND["Merch"]).toBe("TEE")
  })

  it("maps Digital manga → CHAPTER", () => {
    expect(FORMAT_TO_BACKEND["Digital manga"]).toBe("CHAPTER")
  })

  it("maps Event ticket → EVENT", () => {
    expect(FORMAT_TO_BACKEND["Event ticket"]).toBe("EVENT")
  })

  it("maps Poster → POSTER", () => {
    expect(FORMAT_TO_BACKEND["Poster"]).toBe("POSTER")
  })
})

describe("FORMAT_TO_LABEL (inverse map)", () => {
  it("maps TEE → Merch", () => {
    expect(FORMAT_TO_LABEL["TEE"]).toBe("Merch")
  })

  it("is the exact inverse of FORMAT_TO_BACKEND", () => {
    for (const [label, backend] of Object.entries(FORMAT_TO_BACKEND)) {
      expect(FORMAT_TO_LABEL[backend]).toBe(label)
    }
  })
})

describe("PRICE_BAND_TO_AMOUNT", () => {
  it("each band maps to a positive rupee amount", () => {
    for (const amount of Object.values(PRICE_BAND_TO_AMOUNT)) {
      expect(amount).toBeGreaterThan(0)
    }
  })

  it("covers every band in PRICE_BANDS", () => {
    for (const band of PRICE_BANDS) {
      expect(PRICE_BAND_TO_AMOUNT[band]).toBeDefined()
    }
  })

  it("₹900 and above maps to 999", () => {
    expect(PRICE_BAND_TO_AMOUNT["₹900 and above"]).toBe(999)
  })
})

describe("PLATFORM_OPTIONS", () => {
  it("contains 5 options", () => {
    expect(PLATFORM_OPTIONS).toHaveLength(5)
  })

  it("every option has a value and label", () => {
    for (const opt of PLATFORM_OPTIONS) {
      expect(opt.value).toBeTruthy()
      expect(opt.label).toBeTruthy()
    }
  })

  it("values are all lowercase with hyphens (backend-compatible)", () => {
    for (const opt of PLATFORM_OPTIONS) {
      expect(opt.value).toMatch(/^[a-z0-9-]+$/)
    }
  })
})

describe("DEFAULT_CAMPAIGN_SLUG", () => {
  it("is the monsoon samurai tee slug", () => {
    expect(DEFAULT_CAMPAIGN_SLUG).toBe("monsoon-samurai-tee")
  })
})

describe("SOURCE_RE", () => {
  it("accepts valid slugs", () => {
    expect(SOURCE_RE.test("mumbai-comic-con")).toBe(true)
    expect(SOURCE_RE.test("creator-demo")).toBe(true)
    expect(SOURCE_RE.test("direct")).toBe(true)
    expect(SOURCE_RE.test("abc123")).toBe(true)
  })

  it("rejects uppercase letters", () => {
    expect(SOURCE_RE.test("Mumbai")).toBe(false)
    expect(SOURCE_RE.test("DIRECT")).toBe(false)
  })

  it("rejects special characters other than hyphens", () => {
    expect(SOURCE_RE.test("bad source!")).toBe(false)
    expect(SOURCE_RE.test("a@b")).toBe(false)
    expect(SOURCE_RE.test("under_score")).toBe(false)
  })

  it("rejects empty strings", () => {
    expect(SOURCE_RE.test("")).toBe(false)
  })

  it("rejects strings longer than 40 characters", () => {
    expect(SOURCE_RE.test("a".repeat(41))).toBe(false)
  })

  it("accepts strings of exactly 40 characters", () => {
    expect(SOURCE_RE.test("a".repeat(40))).toBe(true)
  })
})
