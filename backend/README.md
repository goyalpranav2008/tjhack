# FandomLoop India — Backend

Express + Prisma API for the FandomLoop demand-testing platform. SQLite in dev; Postgres in production.

---

## Local setup

```bash
npm install
cp .env.example .env        # edit SERVER_SECRET at minimum
npm run db:push             # creates prisma/dev.db
npm run db:seed             # seeds 3 campaigns + 370 pledges + FL-DEMO-0001
npm run dev                 # → http://localhost:4000
```

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Hot-reload dev server (tsx watch) |
| `npm run build` | Compile TypeScript only |
| `npm run build:prod` | Patch Prisma provider + prisma generate + tsc |
| `npm start` | Run compiled output |
| `npm run start:prod` | `prisma db push` then run compiled output (Render start command) |
| `npm test` | Vitest (117 tests: unit + integration) |
| `npm run db:push` | Sync schema to DB |
| `npm run db:seed` / `npm run seed:prod` | Wipe + re-seed demo data |
| `npm run demo:reset` | Force-reset DB + re-seed in one step |

---

## Environment variables

Copy `.env.example` to `.env`. Full reference:

| Variable | Required | Dev default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | `file:./prisma/dev.db` | Prisma DB URL |
| `DB_PROVIDER` | no | `sqlite` | `sqlite` or `postgresql` — patched into schema by `build:prod` |
| `SERVER_SECRET` | yes | — | HMAC key ≥16 chars. **Server exits on start if missing in production.** |
| `PORT` | no | `4000` | HTTP port |
| `CORS_ORIGIN` | no | `localhost:3000,5173` | Comma-separated allowed origins |
| `STUDIO_API_KEY` | no | *(empty)* | Protects studio routes. Empty = bypass in dev. |
| `LLM_API_KEY` | no | *(empty)* | OpenAI-compatible key. Empty = template brief. |
| `LLM_BASE_URL` | no | `https://api.openai.com/v1` | LLM endpoint |
| `LLM_MODEL` | no | `gpt-4o-mini` | Model name |
| `FAN_RATE_MAX` | no | `300` | Fan write rate limit (req/15 min/IP) |
| `TEST_FEE_INR` | no | `10000` | Platform test fee (shown in Console) |

---

## Deploy to Render

`render.yaml` in this directory configures the service automatically.

Manual steps:
1. Create a Render **PostgreSQL** database. Copy the Internal Database URL.
2. Create a Render **Web Service** with root directory `backend/`.
3. Build command: `npm ci && npm run build:prod`
4. Start command: `npm run start:prod`
5. Health check: `/api/health`
6. Set environment variables (see table above).

After deploying:
- From the Render shell or locally: `DATABASE_URL="..." npm run seed:prod`
- Verify: `bash scripts/smoke.sh https://your-api.onrender.com`

---

## How `build:prod` works

```
npm run build:prod
  └─► node scripts/use-provider.mjs   # patches "sqlite" → "postgresql" in schema.prisma
  └─► prisma generate                 # regenerates the client for the right provider
  └─► tsc                             # compiles TypeScript to dist/
```

The patch is idempotent. Local dev is unaffected because `DB_PROVIDER` defaults to `sqlite`.

---

## Demand prior — public signals

`GET /api/campaigns/:slug/prior` returns a 0-100 demand-prior score per city.

**Signals and weights:**

| Signal | Weight | Source |
|---|---|---|
| Google Trends regional interest | 40% | CSV export — `data/trends/<slug>.csv` |
| AniList popularity | 30% | `https://graphql.anilist.co` (no key, 24h cache) |
| Trend direction bonus | 20% | Computed from `data/trends/<slug>-timeseries.csv` |
| Dub availability | 10% | `data/dubs.json` |

**Google Trends CSV export:**
1. Go to [trends.google.com/trends/explore](https://trends.google.com/trends/explore)
2. Search the title, set geo = India, Subregion view
3. Download → `data/trends/<campaign-slug>.csv`
4. For trend direction: switch to "Interest over time" → `data/trends/<campaign-slug>-timeseries.csv`

**AniList caching rule:** 24h cache per title, self-limited to 20 calls/min. Do not run bulk collection.

**Why no Crunchyroll/Netflix data:** No public API. A data-sharing pilot with these platforms would be needed.

---

## Project structure

```
src/
  gate.ts              Pure gate evaluation — no DB
  costProfiles.ts      Per-format default costs
  gateInputBuilder.ts  Shared GateInput constructor
  pseudonym.ts         HMAC pseudonymous ID generator
  app.ts               Express app + middleware
  index.ts             Process entry point (production guard)
  db.ts                Shared Prisma client
  errorShape.ts        Error response helpers
  seed.ts              Demo data seeder
  routes/
    campaigns.ts       Campaigns CRUD + gate + settle + segments + sources + scans
    consent.ts         Consent + withdrawal (DPDPA)
    pledges.ts         Pledge creation + preauthorize
    orders.ts          Verify endpoint + pledge order lookup
  ai/
    routes.ts          /insights + /brief endpoints
    cluster.ts         Keyword comment clustering
    brief.ts           LLM brief with template fallback
  signals/
    anilist.ts         AniList client + 24h cache + rate cap
    trends.ts          Google Trends CSV reader + city→state map
    prior.ts           Prior score + blend formula (pure functions)
    routes.ts          GET /api/campaigns/:slug/prior
  middleware/
    auth.ts            Studio key check
    rateLimit.ts       Fan write rate limiter
  __tests__/
    gate.test.ts       Unit tests — gate (13)
    signals.test.ts    Unit tests — signals (50)
    integration.test.ts HTTP integration tests — supertest (54)
scripts/
  use-provider.mjs     Patch Prisma provider before build:prod
  smoke.sh             Smoke test — run against any base URL
data/
  dubs.json            Dub availability config (editable)
  sample-signals.json  AniList fallback
  trends/              Google Trends CSVs (manually exported)
.cache/
  anilist-*.json       24h AniList response cache (auto-created)
prisma/
  schema.prisma        SQLite dev / Postgres prod
render.yaml            Render deployment config
```
