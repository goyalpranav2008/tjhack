/**
 * Pure gate evaluation logic — no DB access.
 * All arithmetic uses rupee integers; percentages are 0-1 floats.
 */

export type GateInput = {
  price: number;
  royaltyPct: number;
  paymentFeePct: number;
  referralPct: number;
  productionCost: number;
  logisticsCost: number;
  packagingCost: number;
  orders: number;
  minRun: number;
  orderCap: number;
  fixedSetupCost: number;
  rightsCleared: boolean;
  thresholdPct: number;
};

export type GateResult = {
  status: "GO" | "ADAPT" | "STOP";
  contribution: number;       // rupees, rounded to nearest integer
  marginPct: number;          // 3 decimal places
  gatePct: number;            // the threshold used
  breakEvenOrders: number | null;
  reasons: string[];
};

export function evaluateGate(input: GateInput): GateResult {
  const {
    price,
    royaltyPct,
    paymentFeePct,
    referralPct,
    productionCost,
    logisticsCost,
    packagingCost,
    orders,
    minRun,
    orderCap,
    fixedSetupCost,
    rightsCleared,
    thresholdPct,
  } = input;

  // Component costs
  const royalty = price * royaltyPct;
  const paymentFee = price * paymentFeePct;
  const referral = price * referralPct;

  // Contribution per unit (raw float, then rounded to nearest rupee)
  const contributionRaw =
    price - (royalty + productionCost + paymentFee + logisticsCost + packagingCost + referral);

  const contribution = Math.round(contributionRaw);

  // marginPct is computed from the raw (pre-rounded) contribution for accuracy,
  // then rounded to 3 decimal places.
  const marginPct = parseFloat((contributionRaw / price).toFixed(3));

  // Break-even order count (null if contribution <= 0)
  const breakEvenOrders =
    contribution > 0 ? Math.ceil(fixedSetupCost / contribution) : null;

  const reasons: string[] = [];

  // STOP condition: negative contribution — no viable economics
  if (contribution <= 0) {
    reasons.push("negative_contribution");
    if (!rightsCleared) reasons.push("rights_not_cleared");
    return {
      status: "STOP",
      contribution,
      marginPct,
      gatePct: thresholdPct,
      breakEvenOrders,
      reasons,
    };
  }

  // Collect all applicable reasons before deciding status
  if (!rightsCleared) {
    reasons.push("rights_not_cleared");
  }
  if (marginPct < thresholdPct) {
    reasons.push("margin_below_gate");
  }
  if (orders < minRun) {
    reasons.push("orders_below_min_run");
  }
  if (breakEvenOrders !== null && breakEvenOrders > orderCap) {
    reasons.push("break_even_exceeds_cap");
  }

  // Rights not cleared is always a hard STOP, but now with all reasons collected
  if (!rightsCleared) {
    return {
      status: "STOP",
      contribution,
      marginPct,
      gatePct: thresholdPct,
      breakEvenOrders,
      reasons,
    };
  }

  const status = reasons.length === 0 ? "GO" : "ADAPT";

  return {
    status,
    contribution,
    marginPct,
    gatePct: thresholdPct,
    breakEvenOrders,
    reasons,
  };
}
