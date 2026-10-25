/**
 * AniList GraphQL client.
 *
 * Usage rules (AniList Terms of Service):
 *   - Do NOT mass-collect data or use AniList as a database mirror.
 *   - Cache every response for 24 hours (in-memory + JSON file under .cache/).
 *   - Hard rate cap: 20 calls per minute (AniList allows 90/min; we self-limit
 *     to be a polite citizen and leave headroom for other processes).
 *   - Honour HTTP 429 Retry-After headers.
 *
 * Returns null rather than throwing so callers can fall back to sample data.
 */

import fs from "fs";
import path from "path";

// ── Types ─────────────────────────────────────────────────────────────────

export type AniListEntry = {
  id: number;
  title: string;
  popularity: number;
  trending: number;
  averageScore: number | null;
  genres: string[];
  status: string;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  fetchedAt: string;
  isSample: false;
};

// ── Rate limiter ──────────────────────────────────────────────────────────

const RATE_CAP = 20;
const RATE_WINDOW_MS = 60_000;
const callTimestamps: number[] = [];

function rateLimitOk(): boolean {
  const now = Date.now();
  // Evict timestamps older than the window
  while (callTimestamps.length > 0 && callTimestamps[0] < now - RATE_WINDOW_MS) {
    callTimestamps.shift();
  }
  return callTimestamps.length < RATE_CAP;
}

function recordCall() {
  callTimestamps.push(Date.now());
}

// ── In-memory cache ───────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheEntry = { data: AniListEntry; expiresAt: number };
const memCache = new Map<string, CacheEntry>();

// ── File cache ────────────────────────────────────────────────────────────

const CACHE_DIR = path.resolve(process.cwd(), ".cache");

function cacheFilePath(title: string): string {
  const safe = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return path.join(CACHE_DIR, `anilist-${safe}.json`);
}

function readFileCache(title: string): AniListEntry | null {
  try {
    const p = cacheFilePath(title);
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as { data: AniListEntry; expiresAt: number };
    if (raw.expiresAt < Date.now()) return null;
    return raw.data;
  } catch {
    return null;
  }
}

function writeFileCache(title: string, data: AniListEntry): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const payload = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    fs.writeFileSync(cacheFilePath(title), JSON.stringify(payload, null, 2), "utf-8");
  } catch (err) {
    console.warn("[anilist] Could not write file cache:", (err as Error).message);
  }
}

// ── GraphQL query ─────────────────────────────────────────────────────────

const QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME) {
    id
    title { romaji english native }
    popularity
    trending
    averageScore
    genres
    status
    nextAiringEpisode { episode airingAt }
  }
}
`;

// ── Main export ───────────────────────────────────────────────────────────

/**
 * Fetch AniList data for a title.
 * Returns null if rate-limited, network failure, or no result found.
 */
export async function fetchAniList(searchTitle: string): Promise<AniListEntry | null> {
  const key = searchTitle.toLowerCase().trim();

  // 1. Check in-memory cache
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.data;

  // 2. Check file cache
  const file = readFileCache(key);
  if (file) {
    memCache.set(key, { data: file, expiresAt: Date.now() + CACHE_TTL_MS });
    return file;
  }

  // 3. Rate limit check
  if (!rateLimitOk()) {
    console.warn("[anilist] Rate cap reached — returning null");
    return null;
  }

  // 4. Fetch from AniList
  recordCall();
  let retries = 0;
  while (retries <= 2) {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { search: searchTitle } }),
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
        console.warn(`[anilist] 429 — backing off ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        retries++;
        continue;
      }

      if (!res.ok) {
        console.warn(`[anilist] HTTP ${res.status} for "${searchTitle}"`);
        return null;
      }

      const json: any = await res.json();
      const media = json?.data?.Media;
      if (!media) return null;

      const entry: AniListEntry = {
        id: media.id,
        title: media.title.english ?? media.title.romaji ?? searchTitle,
        popularity: media.popularity ?? 0,
        trending: media.trending ?? 0,
        averageScore: media.averageScore ?? null,
        genres: media.genres ?? [],
        status: media.status ?? "UNKNOWN",
        nextAiringEpisode: media.nextAiringEpisode ?? null,
        fetchedAt: new Date().toISOString(),
        isSample: false,
      };

      // Write both caches
      const expiresAt = Date.now() + CACHE_TTL_MS;
      memCache.set(key, { data: entry, expiresAt });
      writeFileCache(key, entry);

      return entry;
    } catch (err) {
      console.warn("[anilist] Fetch error:", (err as Error).message);
      return null;
    }
  }

  return null;
}

/** Inject a pre-built entry into the cache (used by tests). */
export function injectAniListCache(title: string, entry: AniListEntry): void {
  memCache.set(title.toLowerCase().trim(), {
    data: entry,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/** Clear the in-memory cache (used by tests). */
export function clearAniListMemCache(): void {
  memCache.clear();
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Popularity rank score (0-100) ─────────────────────────────────────────
/**
 * Maps AniList popularity (raw follower/list count, typically 0–500 000+)
 * to a 0-100 score.  We use a soft log scale so very popular titles don't
 * crowd out everything else while still rewarding higher popularity.
 *
 *   score = min(100, popularity / 5000)
 *
 * At 500 000 popularity (Attack on Titan level) → 100.
 * At 100 000 popularity (solid hit) → 20.
 * The caller clamps with min(100, …).
 */
export function popularityToScore(popularity: number): number {
  return Math.min(100, popularity / 5000);
}
