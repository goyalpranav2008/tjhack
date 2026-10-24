/**
 * Default cost profiles per product format.
 * Override these at the request level or via MarginGate DB params.
 *
 * Formats: TEE | POSTER | CHAPTER | EVENT
 *   TEE     – physical merchandise (t-shirt, hoodie, etc.)
 *   POSTER  – physical poster / art print
 *   CHAPTER – digital manga / chapter download (no physical fulfilment)
 *   EVENT   – live screening / fan event ticket
 */

export type CostProfile = {
  productionCost: number;
  logisticsCost: number;
  packagingCost: number;
  royaltyPct: number;
  paymentFeePct: number;
  referralPct: number;
  fixedSetupCost: number;
  minRun: number;
  orderCap: number;
};

export const COST_PROFILES: Record<string, CostProfile> = {
  TEE: {
    productionCost: 360,
    logisticsCost: 85,
    packagingCost: 25,
    royaltyPct: 0.15,
    paymentFeePct: 0.02,
    referralPct: 0.05,
    fixedSetupCost: 30000,
    minRun: 100,
    orderCap: 150,
  },
  POSTER: {
    productionCost: 120,
    logisticsCost: 60,
    packagingCost: 20,
    royaltyPct: 0.15,
    paymentFeePct: 0.02,
    referralPct: 0.05,
    fixedSetupCost: 12000,
    minRun: 100,
    orderCap: 200,
  },
  CHAPTER: {
    productionCost: 0,
    logisticsCost: 0,
    packagingCost: 0,
    royaltyPct: 0.20,
    paymentFeePct: 0.02,
    referralPct: 0.05,
    fixedSetupCost: 5000,
    minRun: 200,
    orderCap: 1000,
  },
  // EVENT – live screening or fan-event ticket.
  // Production cost covers venue hire, A/V, and staffing per ticket.
  // Logistics covers printed ticket + courier to the fan.
  // No packaging (ticket ships in a padded envelope, cost absorbed into logistics).
  EVENT: {
    productionCost: 220,
    logisticsCost: 30,
    packagingCost: 0,
    royaltyPct: 0.15,
    paymentFeePct: 0.02,
    referralPct: 0.05,
    fixedSetupCost: 20000,
    minRun: 50,
    orderCap: 500,
  },
};
