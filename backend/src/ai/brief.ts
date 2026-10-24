/**
 * Launch brief generator.
 *
 * Calls the OpenAI chat completions endpoint (compatible with any OpenAI-API-
 * compatible provider) when LLM_API_KEY is set.  Falls back to a clearly
 * labelled template brief so the demo never breaks without a key.
 *
 * CACHING:
 *   Results are cached in memory keyed by `${campaignId}:${verdictStatus}`.
 *   The cache is in-process and survives hot-reloads but is cleared on restart.
 *   For production, swap the Map for Redis or a DB column.
 */

import type { GateResult } from "../gate";
import type { ClusterResult } from "./cluster";

export type BriefSection = {
  heading: string;
  body:    string;
};

export type LaunchBrief = {
  generatedBy: "llm" | "template";
  verdict:      string;
  sections:     BriefSection[];
};

// ── In-process cache ──────────────────────────────────────────────────────
const cache = new Map<string, LaunchBrief>();

// ── Helpers ──────────────────────────────────────────────────────────────

function cacheKey(campaignId: number, verdict: string, pledgeCount: number) {
  return `${campaignId}:${verdict}:${pledgeCount}`;
}

function formatClusters(clusters: ClusterResult[]): string {
  return clusters
    .map((c) => `• ${c.label} (${c.count} comments): "${c.samples[0] ?? ""}"`)
    .join("\n");
}

// ── Template fallback (no API key needed) ─────────────────────────────────

function templateBrief(
  campaignTitle: string,
  gate:     GateResult,
  topSeg:   { city: string; language: string; count: number } | null,
  clusters: ClusterResult[]
): LaunchBrief {
  const verdictLine =
    gate.status === "GO"
      ? `The margin gate passed (${Math.round(gate.marginPct * 100)}% margin ≥ ${Math.round(gate.gatePct * 100)}% threshold). The campaign is viable at the current price.`
      : gate.status === "ADAPT"
      ? `The margin gate needs adjustment: ${gate.reasons.map((r) => r.replace(/_/g, " ")).join(", ")}. Consider a price increase or cost reduction before launching.`
      : `The campaign does not clear the margin gate (contribution ₹${gate.contribution} per order). Re-evaluate pricing or costs before proceeding.`;

  const localise = topSeg
    ? `Strongest demand is from ${topSeg.city} in ${topSeg.language} (${topSeg.count} pledges). Prioritise ${topSeg.language}-language assets.`
    : "Segment data not yet available. Run a demand-signal round before investing in localisation.";

  const topCluster = clusters[0];
  const fanSignal = topCluster
    ? `The top fan theme is "${topCluster.label}" (${topCluster.count} comments). Address this explicitly in campaign copy.`
    : "No comment data yet. Activate the comment field in the next test round.";

  const nextStep =
    gate.status === "GO"
      ? `Open a capped preorder of ${gate.breakEvenOrders != null ? Math.ceil(gate.breakEvenOrders * 1.25) : "~125"} units, collect UPI mandates, and release within 21 days.`
      : gate.status === "ADAPT"
      ? `Run a targeted price-sensitivity test in the top city, then re-evaluate the gate with updated figures.`
      : `Park this campaign. Renegotiate the royalty or reduce production cost, then reopen demand-testing with a new price band.`;

  return {
    generatedBy: "template",
    verdict:      gate.status,
    sections: [
      { heading: "Verdict rationale",     body: verdictLine  },
      { heading: "Localisation priority", body: localise     },
      { heading: "Fan signal",            body: fanSignal    },
      { heading: "Recommended next step", body: nextStep     },
    ],
  };
}

// ── LLM call ──────────────────────────────────────────────────────────────

async function callLlm(
  campaignTitle: string,
  gate:     GateResult,
  topSeg:   { city: string; language: string; count: number } | null,
  clusters: ClusterResult[]
): Promise<LaunchBrief> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY not set");

  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const model   = process.env.LLM_MODEL    ?? "gpt-4o-mini";

  const systemPrompt = `You are a licensing analyst for an anime merchandise platform in India. 
You write concise, structured launch briefs for studio executives. 
Respond with a JSON object matching this TypeScript type exactly:
{
  "verdict": string,        // "GO" | "ADAPT" | "STOP"
  "sections": Array<{
    "heading": string,      // 2-5 words
    "body":    string       // 1-3 sentences, plain language, no markdown
  }>
}
Include exactly these four sections in order: "Verdict rationale", "Localisation priority", "Fan signal", "Recommended next step".
`;

  const userPrompt = `Campaign: "${campaignTitle}"
Gate result: ${gate.status} — contribution ₹${gate.contribution}/order, margin ${Math.round(gate.marginPct * 100)}% (gate ${Math.round(gate.gatePct * 100)}%)
Reasons: ${gate.reasons.length ? gate.reasons.join(", ") : "none"}
Top segment: ${topSeg ? `${topSeg.city}, ${topSeg.language}, ${topSeg.count} pledges` : "none"}
Fan comment clusters:
${clusters.length ? formatClusters(clusters) : "No comments yet."}

Write the launch brief.`;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens:  600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`LLM API error ${resp.status}: ${text}`);
  }

  const data: any = await resp.json();
  const raw = JSON.parse(data.choices[0].message.content) as { verdict: string; sections: BriefSection[] };

  return {
    generatedBy: "llm",
    verdict:      raw.verdict,
    sections:     raw.sections,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function generateBrief(
  campaignId:    number,
  campaignTitle: string,
  gate:     GateResult,
  topSeg:   { city: string; language: string; count: number } | null,
  clusters: ClusterResult[]
): Promise<LaunchBrief> {
  const key = cacheKey(campaignId, gate.status);
  if (cache.has(key)) return cache.get(key)!;

  let brief: LaunchBrief;

  try {
    brief = await callLlm(campaignTitle, gate, topSeg, clusters);
  } catch (err) {
    // Always fall back — the demo must not break without a key
    console.warn("[brief] LLM unavailable, using template:", (err as Error).message);
    brief = templateBrief(campaignTitle, gate, topSeg, clusters);
  }

  cache.set(key, brief);
  return brief;
}

/** Clear the cache for a campaign (call after settle or data update). */
export function invalidateBriefCache(campaignId: number) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${campaignId}:`)) cache.delete(key);
  }
}
