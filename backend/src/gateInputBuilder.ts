/**
 * Shared helper: build a GateInput from a campaign (with marginGate) plus a
 * committed-order count and optional per-call overrides.
 *
 * This is the single source of truth used by:
 *   - GET /api/campaigns (list)
 *   - GET /api/campaigns/:slug
 *   - POST /api/campaigns/evaluate-gate
 *   - POST /api/campaigns/:slug/settle
 *   - POST /api/campaigns/:slug/brief  (ai/routes.ts)
 */

import { GateInput } from "./gate";
import { COST_PROFILES } from "./costProfiles";

/** The minimal shape expected from a Campaign+marginGate include */
export type CampaignForGate = {
  format: string;
  listPrice: number;
  minRun: number;
  orderCap: number;
  fixedSetupCost: number;
  rightsCleared: boolean;
  marginGate: {
    thresholdPct: number;
    royaltyPct: number;
    paymentFeePct: number;
    referralPct: number;
    productionCost: number;
    logisticsCost: number;
    packagingCost: number;
    platformFeePct: number;
  } | null;
};

export type GateOverrides = Partial<{
  price: number;
  royaltyPct: number;
  paymentFeePct: number;
  referralPct: number;
  platformFeePct: number;
  productionCost: number;
  logisticsCost: number;
  packagingCost: number;
  minRun: number;
  orderCap: number;
  fixedSetupCost: number;
  rightsCleared: boolean;
  thresholdPct: number;
}>;

export function buildGateInput(
  campaign: CampaignForGate,
  committedCount: number,
  overrides: GateOverrides = {}
): GateInput {
  const profile = COST_PROFILES[campaign.format] ?? COST_PROFILES["TEE"];
  const gate = campaign.marginGate;

  return {
    price:          overrides.price          ?? campaign.listPrice,
    royaltyPct:     overrides.royaltyPct     ?? gate?.royaltyPct     ?? profile.royaltyPct,
    paymentFeePct:  overrides.paymentFeePct  ?? gate?.paymentFeePct  ?? profile.paymentFeePct,
    referralPct:    overrides.referralPct    ?? gate?.referralPct    ?? profile.referralPct,
    platformFeePct: overrides.platformFeePct ?? gate?.platformFeePct ?? profile.platformFeePct,
    productionCost: overrides.productionCost ?? gate?.productionCost ?? profile.productionCost,
    logisticsCost:  overrides.logisticsCost  ?? gate?.logisticsCost  ?? profile.logisticsCost,
    packagingCost:  overrides.packagingCost  ?? gate?.packagingCost  ?? profile.packagingCost,
    orders:         committedCount,
    minRun:         overrides.minRun         ?? campaign.minRun,
    orderCap:       overrides.orderCap       ?? campaign.orderCap,
    fixedSetupCost: overrides.fixedSetupCost ?? campaign.fixedSetupCost,
    rightsCleared:  overrides.rightsCleared  ?? campaign.rightsCleared,
    thresholdPct:   overrides.thresholdPct   ?? gate?.thresholdPct   ?? 0.20,
  };
}
