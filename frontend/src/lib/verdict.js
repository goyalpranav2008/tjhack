import { inr, num, pct } from "./format.js"

// Starting assumptions. The console sliders change these.
export const DEFAULTS = {
  royalty: 0.15, // share of price paid to the Japanese rights holder
  productionShift: 0, // +0.10 means production costs are 10% higher
  gate: 0.25, // minimum contribution margin the studio will accept
  conversion: 0.3, // share of qualified opt-ins who actually buy
  fee: 0.02, // payment fee
}

// One combo (city + language + format) in, one verdict out.
// Keep these rules in sync with the verdict function in the backend.
export function evaluate(row, a) {
  const production = row.production * (1 + a.productionShift)
  const royaltyCost = row.price * a.royalty
  const feeCost = row.price * a.fee
  const contribution = row.price - royaltyCost - feeCost - production - row.logistics
  const marginPct = contribution / row.price
  const expectedOrders = Math.round(row.optins * a.conversion)
  const breakEven = contribution > 0 ? Math.ceil(row.setup / contribution) : Infinity
  const requiredPrice = Math.ceil((production + row.logistics) / (1 - a.royalty - a.fee - a.gate))
  const base = {
    contribution,
    marginPct,
    expectedOrders,
    breakEven,
    requiredPrice,
    breakdown: { price: row.price, royaltyCost, feeCost, production, logistics: row.logistics },
  }

  if (contribution <= 0) {
    return { ...base, verdict: "STOP", reason: "Every order loses money at this royalty and cost.", next: "Park this combo until costs or royalty change." }
  }

  const marginOk = marginPct >= a.gate
  const ordersOk = expectedOrders >= breakEven

  if (marginOk && ordersOk) {
    return {
      ...base,
      verdict: "GO",
      reason: `Expected ${num(expectedOrders)} orders clear the ${num(breakEven)}-order break-even at a ${pct(marginPct)} margin.`,
      next: `Open a capped preorder of about ${num(Math.ceil(breakEven * 1.25))} units.`,
    }
  }

  if (marginOk && !ordersOk) {
    if (expectedOrders >= 0.6 * breakEven) {
      const gap = breakEven - expectedOrders
      return {
        ...base,
        verdict: "ADAPT",
        reason: `Margin is healthy, but expected orders (${num(expectedOrders)}) are short of the ${num(breakEven)}-order break-even.`,
        next: `Run a creator drive in ${row.city} to find about ${num(gap)} more paying fans, or cut the setup cost.`,
      }
    }
    return {
      ...base,
      verdict: "STOP",
      reason: `Only ${num(expectedOrders)} expected orders against a ${num(breakEven)}-order break-even. Too far apart for a small fix.`,
      next: "Re-test after the next campaign adds more fans.",
    }
  }

  // Margin is below the gate: can a higher price fix it within what fans said they would pay?
  if (requiredPrice <= row.maxPrice) {
    return {
      ...base,
      verdict: "ADAPT",
      reason: `Margin is ${pct(marginPct)}, below the ${pct(a.gate)} gate. A price of ${inr(requiredPrice)} fixes it, and fans said they would pay up to ${inr(row.maxPrice)}.`,
      next: `Test ${inr(requiredPrice)} with a small group of fans before changing the plan.`,
    }
  }
  return {
    ...base,
    verdict: "STOP",
    reason: `Reaching a ${pct(a.gate)} margin needs ${inr(requiredPrice)}, above the ${inr(row.maxPrice)} fans said they would pay.`,
    next: "Renegotiate the royalty or cut production cost, then test again.",
  }
}

export function evaluateAll(rows, a) {
  return rows.map((row) => ({ ...row, ...evaluate(row, a) }))
}
