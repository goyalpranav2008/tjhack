# FandomLoop India — Backend Prototype

Demand-testing platform for licensed anime merch. Creators run short campaigns to gauge fan demand before committing to a production run. The margin gate evaluates whether economics are viable before any fan is charged.

## Stack

- **Runtime**: Node 20+, TypeScript
- **Framework**: Express 4
- **ORM / DB**: Prisma 5 with SQLite (dev) — Postgres-compatible, see migration note
- **Validation**: Zod
- **Tests**: Vitest + Supertest

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and set SERVER_SECRET
cp .env.example .env
# Edit .env — change SERVER_SECRET to a long random string in production

# 3. Push schema to SQLite
npm run db:push

# 4. Seed demo data (3 campaigns + 60 pledges)
npm run db:seed

# 5. Start dev server (hot reload)
npm run dev
# → http://localhost:4000
```

### Other scripts

| Script | Purpose |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run all vitest tests (unit + integration) |
| `npm run db:push` | Sync Prisma schema to the database |
| `npm run db:seed` | Seed demo campaigns and pledges |

---

## Switching to Postgres

1. In `.env`, change `DATABASE_URL` to a Postgres connection string.
2. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
3. Add the enum declarations at the bottom of the schema (instructions are in comments there).
4. Replace `String` fields that hold enum values with their enum types.
5. Run `npm run db:push` (or `prisma migrate deploy` for production).

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Prisma DB URL (`file:./dev.db` for SQLite) |
| `SERVER_SECRET` | yes | HMAC key for pseudonymous ID generation |
| `PORT` | no | HTTP port, defaults to 4000 |

---

## Pseudonymous IDs

`pseudonymousId = HMAC-SHA256(phoneOrDeviceId, SERVER_SECRET)` truncated to 24 hex chars.  
Raw phone numbers are **never stored**.

---

## API Reference

All responses use `Content-Type: application/json`. Errors follow `{ "error": "...", "details": ... }`.

### GET /api/health

```bash
curl http://localhost:4000/api/health
```
```json
{"status":"ok","service":"fandomloop-india","ts":"2026-10-24T09:00:00.000Z"}
```

---

### POST /api/campaigns — Create campaign

```bash
curl -X POST http://localhost:4000/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-anime-tee",
    "title": "My Anime T-Shirt",
    "format": "TEE",
    "listPrice": 799,
    "rightsCleared": true
  }'
```

Omit `minRun`, `orderCap`, `fixedSetupCost`, and gate params to use defaults from the cost profile for the format.

---

### GET /api/campaigns — List all campaigns

Returns campaigns with live pledge count, progress % toward minRun, and current gate verdict.

```bash
curl http://localhost:4000/api/campaigns
```

---

### GET /api/campaigns/:slug — Single campaign

```bash
curl http://localhost:4000/api/campaigns/monsoon-samurai-tee
```
```json
{
  "slug": "monsoon-samurai-tee",
  "listPrice": 799,
  "pledgeCount": 20,
  "progressPct": 20.0,
  "gateVerdict": {
    "status": "ADAPT",
    "contribution": 153,
    "marginPct": 0.192,
    "gatePct": 0.2,
    "breakEvenOrders": 197,
    "reasons": ["margin_below_gate", "orders_below_min_run", "break_even_exceeds_cap"]
  }
}
```

---

### POST /api/campaigns/evaluate-gate — Evaluate margin gate

The three seed cases below confirm the core logic.

**Case 1 — price 999 → GO**
```bash
curl -X POST http://localhost:4000/api/campaigns/evaluate-gate \
  -H "Content-Type: application/json" \
  -d '{"price":999,"format":"TEE","orders":120,"rightsCleared":true}'
```
```json
{
  "status": "GO",
  "contribution": 309,
  "marginPct": 0.31,
  "gatePct": 0.2,
  "breakEvenOrders": 98,
  "reasons": []
}
```

**Case 2 — price 799 → ADAPT (margin below gate, break-even exceeds cap)**
```bash
curl -X POST http://localhost:4000/api/campaigns/evaluate-gate \
  -H "Content-Type: application/json" \
  -d '{"price":799,"format":"TEE","orders":120,"rightsCleared":true}'
```
```json
{
  "status": "ADAPT",
  "contribution": 153,
  "marginPct": 0.192,
  "gatePct": 0.2,
  "breakEvenOrders": 197,
  "reasons": ["margin_below_gate", "break_even_exceeds_cap"]
}
```

**Case 3 — price 499 → STOP (negative contribution)**
```bash
curl -X POST http://localhost:4000/api/campaigns/evaluate-gate \
  -H "Content-Type: application/json" \
  -d '{"price":499,"format":"TEE","orders":120,"rightsCleared":true}'
```
```json
{
  "status": "STOP",
  "contribution": -81,
  "marginPct": -0.162,
  "gatePct": 0.2,
  "breakEvenOrders": null,
  "reasons": []
}
```

Every call is logged in the `GateEvaluation` table as an audit trail.

---

### POST /api/consent — Record consent, get pseudonymousId

```bash
curl -X POST http://localhost:4000/api/consent \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+91-9876543210",
    "purpose": "campaign_pledge",
    "noticeVersion": "v1.0",
    "ageConfirmed": true
  }'
```
```json
{"pseudonymousId":"a8222871a2557fb7bfe3a0b4","consentId":1}
```

Rejected with 400 if `ageConfirmed` is false and `guardianConsent` is not true.

---

### POST /api/pledges — Record a pledge

```bash
curl -X POST http://localhost:4000/api/pledges \
  -H "Content-Type: application/json" \
  -d '{
    "campaignSlug": "monsoon-samurai-tee-999",
    "consentId": 1,
    "pseudonymousId": "a8222871a2557fb7bfe3a0b4",
    "city": "Bengaluru",
    "language": "English",
    "format": "TEE",
    "pricePaid": 999
  }'
```

Valid cities: `Delhi NCR`, `Bengaluru`, `Chennai`, `Kolkata`  
Valid languages: `Hindi`, `Tamil`, `English`, `Bengali`

---

### POST /api/pledges/:id/preauthorize — Mock UPI mandate

No real payment. Returns `mock: true`.

```bash
curl -X POST http://localhost:4000/api/pledges/1/preauthorize
```
```json
{
  "mock": true,
  "pledge": {"id": 1, "status": "PREAUTHORIZED", "...": "..."},
  "mandateRef": "MOCK-UPI-1720000000000-AB3X9Z",
  "note": "No real payment has been taken."
}
```

---

### POST /api/campaigns/:slug/settle — Run gate and settle pledges

Runs the gate on actual pledge count. On GO: `PREAUTHORIZED` → `CAPTURED`. On ADAPT/STOP: `PREAUTHORIZED` → `RELEASED` (no fan is charged).

```bash
curl -X POST http://localhost:4000/api/campaigns/monsoon-samurai-tee-999/settle
```

---

### GET /api/campaigns/:slug/segments — Demand segments

Groups pledges by city × language × format. Returns demand score (0–100) and verdict per segment.

```bash
curl http://localhost:4000/api/campaigns/monsoon-samurai-tee/segments
```
```json
{
  "segments": [
    {
      "city": "Delhi NCR",
      "language": "Hindi",
      "format": "TEE",
      "count": 5,
      "avgPrice": 799,
      "demandScore": 85,
      "verdict": "GO"
    }
  ]
}
```

**Score formula** (0–100):
- 50% — volume: group count / max group count across all segments
- 30% — price willingness: share of pledges at the single most popular price point
- 20% — concentration: this group's share of total pledges

Verdict thresholds: ≥75 = GO, 50–74 = ADAPT, <50 = STOP.

---

## Cost Profiles (defaults per format)

Defined in `src/costProfiles.ts`. Override any field via the request body or via a campaign's `MarginGate` record.

| Field | TEE | POSTER | CHAPTER |
|---|---|---|---|
| productionCost | ₹360 | ₹120 | ₹0 |
| logisticsCost | ₹85 | ₹60 | ₹0 |
| packagingCost | ₹25 | ₹20 | ₹0 |
| royaltyPct | 15% | 15% | 20% |
| paymentFeePct | 2% | 2% | 2% |
| referralPct | 5% | 5% | 5% |
| fixedSetupCost | ₹30,000 | ₹12,000 | ₹5,000 |
| minRun | 100 | 100 | 200 |
| orderCap | 150 | 200 | 1,000 |

---

## Project structure

```
src/
  gate.ts           Pure gate logic — no DB, fully unit tested
  costProfiles.ts   Per-format default cost config
  pseudonym.ts      HMAC pseudonymous ID generator
  app.ts            Express app + middleware
  index.ts          Process entry point
  db.ts             Shared Prisma client
  errorShape.ts     Consistent error response helpers
  seed.ts           Demo data seeder
  routes/
    campaigns.ts    CRUD + evaluate-gate + settle + segments
    consent.ts      ConsentLog creation
    pledges.ts      Pledge creation + preauthorize
  __tests__/
    gate.test.ts         Unit tests (pure function)
    integration.test.ts  HTTP integration tests (supertest)
prisma/
  schema.prisma     Prisma schema (SQLite now, Postgres-ready)
```
