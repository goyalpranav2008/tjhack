/**
 * Unit tests for gate.ts — pure function, no DB.
 *
 * TEE profile: production 360, logistics 85, packaging 25,
 *              royaltyPct 0.15, paymentFeePct 0.02, referralPct 0.05, platformFeePct 0.05
 *              fixedSetupCost 30000, minRun 100, orderCap 150
 */

import { describe, it, expect } from "vitest";
import { evaluateGate, GateInput } from "../gate";
import { COST_PROFILES } from "../costProfiles";

const teeProfile = COST_PROFILES["TEE"];

function teeInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    price: 999,
    royaltyPct: teeProfile.royaltyPct,       // 0.15
    paymentFeePct: teeProfile.paymentFeePct,   // 0.02
    referralPct: teeProfile.referralPct,       // 0.05
    platformFeePct: teeProfile.platformFeePct, // 0.05
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

describe("gate.ts — evaluateGate() with platform fee", () => {

  // ── price 999 → GO ────────────────────────────────────────────────────────
  // royalty=149.85, payFee=19.98, referral=49.95, platform=49.95
  // variableCosts = 360+85+25 = 470
  // contribution = 999 - (149.85+360+19.98+85+25+49.95+49.95) = 999 - 739.73 = 259.27 → 259
  // margin = 259.27/999 = 0.25953 → toFixed(3) = 0.260
  // breakEven = ceil(30000/259) = ceil(115.83) = 116 ≤ 150 → GO
  it("price 999, orders 120 → GO, contribution 259, margin ~0.260", () => {
    const result = evaluateGate(teeInput({ price: 999, orders: 120 }));

    expect(result.contribution).toBe(259);
    expect(result.marginPct).toBeCloseTo(0.260, 2);
    expect(result.status).toBe("GO");
    expect(result.reasons).toHaveLength(0);
    expect(result.breakEvenOrders).toBe(116);
  });

  // ── price 949 → GO ────────────────────────────────────────────────────────
  // royalty=142.35, payFee=18.98, referral=47.45, platform=47.45
  // contribution = 949 - (142.35+360+18.98+85+25+47.45+47.45) = 949 - 726.23 = 222.77 → 223
  // margin = 222.77/949 = 0.23474 → 0.235
  // breakEven = ceil(30000/223) = ceil(134.53) = 135 ≤ 150 → GO
  it("price 949, orders 120 → GO, contribution 223, margin ~0.235, break-even 135", () => {
    const result = evaluateGate(teeInput({ price: 949, orders: 120 }));

    expect(result.contribution).toBe(223);
    expect(result.marginPct).toBeCloseTo(0.235, 2);
    expect(result.status).toBe("GO");
    expect(result.breakEvenOrders).toBe(135);
  });

  // ── price 899 → ADAPT (break-even exceeds cap) ────────────────────────────
  // royalty=134.85, payFee=17.98, referral=44.95, platform=44.95
  // contribution = 899 - (134.85+360+17.98+85+25+44.95+44.95) = 899 - 712.73 = 186.27 → 186
  // margin = 186.27/899 = 0.20720 → 0.207 — above gate
  // breakEven = ceil(30000/186) = ceil(161.29) = 162 > 150 → ADAPT, break_even_exceeds_cap
  it("price 899, orders 120 → ADAPT, contribution 186, break-even 162 > cap 150", () => {
    const result = evaluateGate(teeInput({ price: 899, orders: 120 }));

    expect(result.contribution).toBe(186);
    expect(result.marginPct).toBeCloseTo(0.207, 2);
    expect(result.status).toBe("ADAPT");
    expect(result.reasons).toContain("break_even_exceeds_cap");
    expect(result.reasons).not.toContain("margin_below_gate");
    // break-even: ceil(30000/186) = 162
    expect(result.breakEvenOrders).toBe(162);
  });

  // ── price 799 → ADAPT (margin below gate) ─────────────────────────────────
  // royalty=119.85, payFee=15.98, referral=39.95, platform=39.95
  // contribution = 799 - (119.85+360+15.98+85+25+39.95+39.95) = 799 - 685.73 = 113.27 → 113
  // margin = 113.27/799 = 0.14177 → 0.142 < 0.20 → margin_below_gate
  // breakEven = ceil(30000/113) = ceil(265.49) = 266 > 150 → also break_even_exceeds_cap
  it("price 799, orders 120 → ADAPT, contribution 113, margin ~0.142", () => {
    const result = evaluateGate(teeInput({ price: 799, orders: 120 }));

    expect(result.contribution).toBe(113);
    expect(result.marginPct).toBeCloseTo(0.142, 2);
    expect(result.status).toBe("ADAPT");
    expect(result.reasons).toContain("margin_below_gate");
  });

  // ── price 499 → STOP (negative contribution) ─────────────────────────────
  // royalty=74.85, payFee=9.98, referral=24.95, platform=24.95
  // contribution = 499 - (74.85+360+9.98+85+25+24.95+24.95) = 499 - 604.73 = -105.73 → -106
  it("price 499, orders 120 → STOP (negative contribution), contribution -106", () => {
    const result = evaluateGate(teeInput({ price: 499, orders: 120 }));

    expect(result.contribution).toBe(-106);
    expect(result.status).toBe("STOP");
    expect(result.breakEvenOrders).toBeNull();
    expect(result.reasons).toContain("negative_contribution");
  });

  // ── price 950, royaltyPct 0.25 → ADAPT ────────────────────────────────────
  // royalty=237.5, payFee=19, referral=47.5, platform=47.5
  // contribution = 950 - (237.5+360+19+85+25+47.5+47.5) = 950 - 821.5 = 128.5 → 129
  // margin = 128.5/950 = 0.13526 → 0.135 < 0.20 → margin_below_gate
  // breakEven = ceil(30000/129) = 233 > 150 → also break_even_exceeds_cap
  it("price 950, royaltyPct 0.25 → ADAPT, contribution 129, margin ~0.135, break-even 233", () => {
    const result = evaluateGate(
      teeInput({ price: 950, royaltyPct: 0.25, orders: 120 })
    );

    expect(result.contribution).toBe(129);
    expect(result.marginPct).toBeCloseTo(0.135, 2);
    expect(result.status).toBe("ADAPT");
    expect(result.reasons).toContain("margin_below_gate");
    expect(result.breakEvenOrders).toBe(233);
  });

  // ── Breakdown object ──────────────────────────────────────────────────────
  it("result includes a breakdown object with all cost components", () => {
    const result = evaluateGate(teeInput({ price: 999, orders: 120 }));

    expect(result.breakdown).toBeDefined();
    expect(result.breakdown.price).toBe(999);
    expect(result.breakdown.royalty).toBe(149.85);
    expect(result.breakdown.production).toBe(360);
    expect(result.breakdown.paymentFee).toBe(19.98);
    expect(result.breakdown.logistics).toBe(85);
    expect(result.breakdown.packaging).toBe(25);
    expect(result.breakdown.referral).toBe(49.95);
    expect(result.breakdown.platformFee).toBe(49.95);
  });

  // ── rightsCleared false → STOP ────────────────────────────────────────────
  it("rightsCleared false → STOP with reason rights_not_cleared", () => {
    const result = evaluateGate(teeInput({ price: 999, orders: 200, rightsCleared: false }));

    expect(result.status).toBe("STOP");
    expect(result.reasons).toContain("rights_not_cleared");
  });

  // ── orders below minRun → ADAPT ───────────────────────────────────────────
  it("orders below minRun → ADAPT with orders_below_min_run", () => {
    // Price 999 so margin is fine (0.260 > 0.20) and breakEven(116) ≤ cap(150);
    // only orders(50) < minRun(100) should fire
    const result = evaluateGate(teeInput({ price: 999, orders: 50 }));
    expect(result.status).toBe("ADAPT");
    expect(result.reasons).toContain("orders_below_min_run");
  });

  // ── breakEvenOrders null when contribution ≤ 0 ───────────────────────────
  it("breakEvenOrders is null when contribution <= 0", () => {
    const result = evaluateGate(teeInput({ price: 200, orders: 120 }));
    expect(result.breakEvenOrders).toBeNull();
    expect(result.status).toBe("STOP");
  });

  it("breakEvenOrders is ceil(fixedSetupCost / contribution) when contribution > 0", () => {
    const result = evaluateGate(teeInput({ price: 999, orders: 200 }));
    // contribution = 259, fixedSetupCost = 30000 → ceil(30000/259) = ceil(115.83) = 116
    expect(result.breakEvenOrders).toBe(116);
  });

  // ── gatePct echoed back ───────────────────────────────────────────────────
  it("gatePct echoes the thresholdPct input", () => {
    const result = evaluateGate(teeInput({ thresholdPct: 0.25 }));
    expect(result.gatePct).toBe(0.25);
  });

  // ── Committed vs opt-in count ─────────────────────────────────────────────
  // The gate uses only committed (passed-in) orders, not the full opt-in count.
  it("uses orders param as committed count — different from total opt-ins", () => {
    // 200 total opt-ins, but only 110 committed → pass orders: 110 → GO
    const goResult = evaluateGate(teeInput({ price: 999, orders: 110 }));
    expect(goResult.status).toBe("GO");

    // If we accidentally passed 200, same verdict, but if we pass 50 → ADAPT
    const adaptResult = evaluateGate(teeInput({ price: 999, orders: 50 }));
    expect(adaptResult.status).toBe("ADAPT");
    expect(adaptResult.reasons).toContain("orders_below_min_run");
  });
});
