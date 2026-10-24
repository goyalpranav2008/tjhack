/**
 * Unit tests for gate.ts — pure function, no DB.
 */

import { describe, it, expect } from "vitest";
import { evaluateGate, GateInput } from "../gate";
import { COST_PROFILES } from "../costProfiles";

const teeProfile = COST_PROFILES["TEE"];

function teeInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    price: 799,
    royaltyPct: teeProfile.royaltyPct,       // 0.15
    paymentFeePct: teeProfile.paymentFeePct,   // 0.02
    referralPct: teeProfile.referralPct,       // 0.05
    productionCost: teeProfile.productionCost, // 360
    logisticsCost: teeProfile.logisticsCost,   // 85
    packagingCost: teeProfile.packagingCost,   // 25
    orders: 120,
    minRun: teeProfile.minRun,                 // 100
    orderCap: teeProfile.orderCap,             // 150
    fixedSetupCost: teeProfile.fixedSetupCost, // 30000
    rightsCleared: true,
    thresholdPct: 0.20,
    ...overrides,
  };
}

describe("gate.ts — evaluateGate()", () => {
  // ── price 999 → GO ────────────────────────────────────────────────────────
  it("price 999, orders 120 → GO, contribution 309, marginPct ~0.309", () => {
    const result = evaluateGate(teeInput({ price: 999, orders: 120 }));

    // royalty=149.85, payFee=19.98, referral=49.95 → sum pct costs=219.78
    // variable costs = 360+85+25 = 470
    // contribution = 999 - (149.85 + 360 + 19.98 + 85 + 25 + 49.95) = 999 - 689.78 = 309.22 → rounds to 309
    // marginPct = 309.22 / 999 = 0.30953 → toFixed(3) = "0.310" → 0.31
    expect(result.contribution).toBe(309);
    expect(result.marginPct).toBeCloseTo(0.309, 2); // 0.310 is within 0.005 of 0.309
    expect(result.status).toBe("GO");
    expect(result.reasons).toHaveLength(0);
  });

  // ── price 799 → ADAPT ─────────────────────────────────────────────────────
  it("price 799, orders 120 → ADAPT, contribution 153, marginPct ~0.192", () => {
    const result = evaluateGate(teeInput({ price: 799, orders: 120 }));

    // royalty=119.85, payFee=15.98, referral=39.95 → pct costs=175.78
    // contribution = 799 - (119.85 + 360 + 15.98 + 85 + 25 + 39.95) = 799 - 645.78 = 153.22 → 153
    expect(result.contribution).toBe(153);
    expect(result.marginPct).toBeCloseTo(0.192, 2);
    expect(result.status).toBe("ADAPT");
    // margin below gate (0.192 < 0.20) and break-even exceeds cap (30000/153 ≈ 197 > 150)
    expect(result.reasons).toContain("margin_below_gate");
    expect(result.reasons).toContain("break_even_exceeds_cap");
  });

  // ── price 499 → STOP (negative contribution) ─────────────────────────────
  it("price 499, orders 120 → STOP (negative contribution)", () => {
    const result = evaluateGate(teeInput({ price: 499, orders: 120 }));

    // royalty=74.85, payFee=9.98, referral=24.95 → pct costs=109.78
    // contribution = 499 - (74.85 + 360 + 9.98 + 85 + 25 + 24.95) = 499 - 579.78 = -80.78 → -81
    expect(result.contribution).toBe(-81);
    expect(result.status).toBe("STOP");
    expect(result.breakEvenOrders).toBeNull();
  });

  // ── royaltyPct 0.25 at price 950 → ADAPT, contribution 176, margin ~0.185 ─
  it("royaltyPct 0.25 at price 950 → ADAPT, contribution ~176, margin ~0.185", () => {
    const result = evaluateGate(
      teeInput({ price: 950, royaltyPct: 0.25, orders: 120 })
    );

    // royalty=237.5, payFee=19, referral=47.5
    // contribution = 950 - (237.5 + 360 + 19 + 85 + 25 + 47.5) = 950 - 774 = 176
    expect(result.contribution).toBe(176);
    expect(result.marginPct).toBeCloseTo(0.185, 2);
    expect(result.status).toBe("ADAPT");
    expect(result.reasons).toContain("margin_below_gate");
  });

  // ── rightsCleared false → STOP, reason rights_not_cleared ────────────────
  it("rightsCleared false → STOP with reason rights_not_cleared", () => {
    const result = evaluateGate(teeInput({ price: 999, orders: 200, rightsCleared: false }));

    expect(result.status).toBe("STOP");
    expect(result.reasons).toContain("rights_not_cleared");
  });

  // ── orders below minRun → ADAPT with orders_below_min_run ────────────────
  it("orders below minRun → ADAPT with orders_below_min_run", () => {
    // Price 999 so margin is fine; drop orders well below minRun
    const result = evaluateGate(teeInput({ price: 999, orders: 50 }));
    expect(result.status).toBe("ADAPT");
    expect(result.reasons).toContain("orders_below_min_run");
  });

  // ── break-even check ──────────────────────────────────────────────────────
  it("breakEvenOrders is null when contribution <= 0", () => {
    const result = evaluateGate(teeInput({ price: 200, orders: 120 }));
    expect(result.breakEvenOrders).toBeNull();
    expect(result.status).toBe("STOP");
  });

  it("breakEvenOrders is ceil(fixedSetupCost / contribution) when contribution > 0", () => {
    const result = evaluateGate(teeInput({ price: 999, orders: 200 }));
    // contribution = 309, fixedSetupCost = 30000 → ceil(30000/309) = ceil(97.09) = 98
    expect(result.breakEvenOrders).toBe(98);
  });

  // ── gatePct is echoed back ────────────────────────────────────────────────
  it("gatePct echoes the thresholdPct input", () => {
    const result = evaluateGate(teeInput({ thresholdPct: 0.25 }));
    expect(result.gatePct).toBe(0.25);
  });
});
