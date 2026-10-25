/**
 * Text classifiers for topic and sentiment.
 *
 * Three methods sharing one interface:
 *   baseline  – always predicts the modal (most common) label. Shows the floor.
 *   keyword   – rule-based: wraps cluster.ts topic logic + lexicon sentiment.
 *   llm       – calls LLM_API_KEY at temperature 0, batching up to 20 per request.
 *               Returns status "not-run" when key is absent.
 *
 * No model is trained. These are rules plus an optional API call.
 */

import fs from "fs";
import path from "path";
import { clusterComments } from "../ai/cluster";

// ── Shared types ──────────────────────────────────────────────────────────

export type TopicLabel = "price" | "dubbing" | "merch-quality" | "delivery" | "events" | "other";
export type SentimentLabel = "positive" | "negative" | "neutral";

export type Classification = {
  topic: TopicLabel;
  sentiment: SentimentLabel;
};

export type ClassifierStatus = "ok" | "not-run";

export type ClassifierResult = Classification & { status: ClassifierStatus };

// ── Cluster → topic label mapping ─────────────────────────────────────────
// Maps cluster.ts label strings → our canonical TopicLabel values
const CLUSTER_TO_TOPIC: Record<string, TopicLabel> = {
  "Price & value":              "price",
  "Dubbing & language":         "dubbing",
  "Merch quality":              "merch-quality",
  "Delivery & availability":    "delivery",
  "Events & screenings":        "events",
  "Other / General feedback":   "other",
};

// ── Sentiment lexicon ─────────────────────────────────────────────────────

let _lexCache: { positive: Record<string, string[]>; negative: Record<string, string[]> } | null = null;

function getLexicon() {
  if (_lexCache) return _lexCache;
  try {
    const p = path.resolve(process.cwd(), "data", "sentiment_lexicon.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    _lexCache = { positive: raw.positive ?? {}, negative: raw.negative ?? {} };
  } catch {
    _lexCache = { positive: {}, negative: {} };
  }
  return _lexCache;
}

function keywordSentiment(text: string): SentimentLabel {
  const lower = text.toLowerCase();
  const lex = getLexicon();
  let pos = 0, neg = 0;

  for (const words of Object.values(lex.positive)) {
    for (const w of words) {
      if (lower.includes(w.toLowerCase())) pos++;
    }
  }
  for (const words of Object.values(lex.negative)) {
    for (const w of words) {
      if (lower.includes(w.toLowerCase())) neg++;
    }
  }

  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

// ── Baseline classifier ───────────────────────────────────────────────────

/**
 * Always predicts the modal label from the training set.
 * This is the naive floor — any real classifier should beat it.
 */
export const BASELINE_TOPIC: TopicLabel     = "other";
export const BASELINE_SENTIMENT: SentimentLabel = "positive";

export function classifyBaseline(_text: string): ClassifierResult {
  return { topic: BASELINE_TOPIC, sentiment: BASELINE_SENTIMENT, status: "ok" };
}

// ── Keyword classifier ────────────────────────────────────────────────────

export function classifyKeyword(text: string): ClassifierResult {
  // Re-use cluster.ts for topic detection (single comment as array)
  const clusters = clusterComments([text]);
  const topCluster = clusters[0]?.label ?? "Other / General feedback";
  const topic: TopicLabel = CLUSTER_TO_TOPIC[topCluster] ?? "other";
  const sentiment = keywordSentiment(text);
  return { topic, sentiment, status: "ok" };
}

// ── LLM classifier ────────────────────────────────────────────────────────

const TOPIC_VALUES:     TopicLabel[]     = ["price","dubbing","merch-quality","delivery","events","other"];
const SENTIMENT_VALUES: SentimentLabel[] = ["positive","negative","neutral"];

async function llmBatch(texts: string[]): Promise<Classification[]> {
  const apiKey  = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const model   = process.env.LLM_MODEL    ?? "gpt-4o-mini";

  const system = `Classify each comment. Reply with ONLY a JSON array, one object per input comment, in the same order.
Each object: { "topic": <one of: price|dubbing|merch-quality|delivery|events|other>, "sentiment": <positive|negative|neutral> }
No extra keys. No markdown. Comments may be in Hindi, Tamil, Telugu, Bengali, Hinglish, or English.`;

  const user = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");

  let attempt = 0;
  while (attempt < 2) {
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user",   content: user   },
          ],
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data: any = await resp.json();
      const raw = JSON.parse(data.choices[0].message.content);
      // Response may be { results: [...] } or just [...]
      const arr: any[] = Array.isArray(raw) ? raw : (raw.results ?? Object.values(raw));

      return arr.map((item: any) => ({
        topic:     TOPIC_VALUES.includes(item.topic)         ? item.topic     : "other",
        sentiment: SENTIMENT_VALUES.includes(item.sentiment) ? item.sentiment : "neutral",
      }));
    } catch (err) {
      attempt++;
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("LLM batch failed after 2 attempts");
}

export async function classifyLlmBatch(
  texts: string[]
): Promise<Array<ClassifierResult>> {
  if (!process.env.LLM_API_KEY) {
    return texts.map(() => ({
      topic: "other" as TopicLabel,
      sentiment: "neutral" as SentimentLabel,
      status: "not-run" as ClassifierStatus,
    }));
  }

  const BATCH = 20;
  const results: ClassifierResult[] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    try {
      const batch = await llmBatch(slice);
      results.push(...batch.map((c) => ({ ...c, status: "ok" as ClassifierStatus })));
    } catch (err) {
      console.warn("[llm-classify] batch failed:", (err as Error).message);
      results.push(...slice.map(() => ({
        topic: "other" as TopicLabel,
        sentiment: "neutral" as SentimentLabel,
        status: "not-run" as ClassifierStatus,
      })));
    }
  }

  return results;
}
