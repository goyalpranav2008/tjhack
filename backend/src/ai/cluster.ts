/**
 * Comment clustering — heuristic implementation.
 *
 * WHY NO EMBEDDINGS HERE:
 *   A real embedding model (e.g. text-embedding-3-small) would give far better
 *   semantic grouping but requires an API key and network call per comment.
 *   For the demo we use a fast, offline keyword + script-detection heuristic
 *   that works without any credentials and produces reasonable clusters on
 *   Hindi, Tamil, Telugu, Bengali, and English text.
 *
 * HOW IT WORKS:
 *   1. Detect the Unicode script of each comment (Devanagari / Tamil / Telugu /
 *      Bengali / Latin) to flag the language.
 *   2. Normalize to lowercase Latin and match against keyword groups.
 *   3. A comment can match at most one cluster (highest-weight wins).
 *   4. Unmatched comments fall into "Other / General feedback".
 *
 * TO UPGRADE:
 *   Replace the body of `clusterComments` with calls to your embedding service
 *   and a k-means step. Keep the ClusterResult type identical so callers don't
 *   need to change.
 */

export type ClusterResult = {
  label:    string;
  count:    number;
  samples:  string[];   // up to 3 representative comments
};

// ── Script detection ─────────────────────────────────────────────────────
// Unicode block ranges for Indic scripts
const SCRIPT_RE = {
  Devanagari: /[\u0900-\u097F]/,
  Tamil:      /[\u0B80-\u0BFF]/,
  Telugu:     /[\u0C00-\u0C7F]/,
  Bengali:    /[\u0980-\u09FF]/,
};

function detectScript(text: string): string {
  for (const [name, re] of Object.entries(SCRIPT_RE)) {
    if (re.test(text)) return name;
  }
  return "Latin";
}

// ── Keyword clusters ──────────────────────────────────────────────────────
// Each cluster has a list of keyword fragments (matched case-insensitively on
// the Latin/transliterated form) and Indic script patterns where available.
const CLUSTER_DEFS: Array<{
  label:    string;
  keywords: string[];
  scripts?: RegExp[];
}> = [
  {
    label:    "Price & value",
    keywords: ["price", "cost", "expensive", "cheap", "afford", "₹", "rupee",
               "discount", "sasta", "mehnga", "paisa", "rate"],
    scripts:  [/सस्त|महंग|क़ीमत|दाम/i, /விலை/i],
  },
  {
    label:    "Dubbing & language",
    keywords: ["dub", "sub", "subtitle", "language", "hindi", "tamil", "telugu",
               "bengali", "dubbed", "translation", "voice", "audio",
               "bhasha", "awaaz"],
    scripts:  [/हिंदी|भाषा|आवाज/i, /மொழி|குரல்/i],
  },
  {
    label:    "Merch quality",
    keywords: ["quality", "fabric", "size", "shirt", "tee", "hoodie", "print",
               "material", "kapda", "kapada", "rang", "color", "colour",
               "washable", "soft", "cotton"],
    scripts:  [/कपड़|गुणवत्ता|रंग/i],
  },
  {
    label:    "Delivery & availability",
    keywords: ["deliver", "shipping", "ship", "city", "available", "india",
               "local", "store", "stock", "online", "order", "dispatch",
               "jaldi", "fast", "speed", "courier"],
    scripts:  [/डिलीवरी|उपलब्ध/i],
  },
  {
    label:    "Events & screenings",
    keywords: ["event", "screen", "theatre", "theater", "watch", "live",
               "fan meet", "meetup", "show", "expo", "convention", "cosplay"],
    scripts:  [/इवेंट|स्क्रीनिंग/i, /நிகழ்ச்சி/i],
  },
];

// ── Main export ──────────────────────────────────────────────────────────

export function clusterComments(comments: string[]): ClusterResult[] {
  const nonEmpty = comments.filter((c) => c.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  // Accumulate matches per cluster
  const buckets: Map<string, string[]> = new Map(
    CLUSTER_DEFS.map((d) => [d.label, []])
  );
  const otherBucket: string[] = [];

  for (const comment of nonEmpty) {
    const lower  = comment.toLowerCase();
    const script = detectScript(comment);
    let bestLabel: string | null = null;
    let bestScore = 0;

    for (const def of CLUSTER_DEFS) {
      let score = 0;
      for (const kw of def.keywords) {
        if (lower.includes(kw)) score += 2;
      }
      if (def.scripts) {
        for (const re of def.scripts) {
          if (re.test(comment)) score += 3; // Indic match is a stronger signal
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestLabel = def.label;
      }
    }

    if (bestLabel) {
      buckets.get(bestLabel)!.push(comment);
    } else {
      otherBucket.push(comment);
    }
  }

  // Build results: only non-empty clusters, sorted by count desc
  const results: ClusterResult[] = [];

  for (const [label, items] of buckets.entries()) {
    if (items.length > 0) {
      results.push({
        label,
        count:   items.length,
        samples: items.slice(0, 3),
      });
    }
  }

  if (otherBucket.length > 0) {
    results.push({
      label:   "Other / General feedback",
      count:   otherBucket.length,
      samples: otherBucket.slice(0, 3),
    });
  }

  results.sort((a, b) => b.count - a.count);

  // Keep at most 5 clusters as specified
  return results.slice(0, 5);
}
