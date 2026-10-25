# FandomLoop India

Demand-testing platform for licensed anime merchandise. Studios run campaigns to gauge fan interest before committing to a production run. Fans vote, preorder, and verify official items — all anonymously.

---

## Architecture

```
tjhack/
  backend/    Node.js · Express · Prisma · SQLite (dev) / Postgres (prod)
  frontend/   React 18 · Vite · Tailwind CSS v4 · Framer Motion · Recharts
```

```
Fan browser  ──POST /api/consent──►  Express API  ──►  Prisma  ──►  SQLite / Postgres
             ──POST /api/pledges──►
             ──GET  /api/verify/:serial──►

Studio browser ──GET  /api/campaigns──►   Express API
               ──POST /api/campaigns/:slug/settle──►  (X-Studio-Key required)
               ──GET  /api/campaigns/:slug/prior──►   AniList + Trends signals
```

---

## Quick start (local dev)

**Requirements:** Node.js 20+, curl, jq (for smoke test)

```bash
# 1. Install dependencies
cd backend  && npm install
cd ../frontend && npm install

# 2. Set up backend environment
cd backend
cp .env.example .env
# Edit .env — change SERVER_SECRET to any string for local dev

# 3. Create the SQLite database and seed demo data
npm run db:push
npm run db:seed

# 4. Start both servers in separate terminals
cd backend  && npm run dev    # → http://localhost:4000
cd frontend && npm run dev    # → http://localhost:5173
```

Open **http://localhost:5173** in your browser.  
Studio console: **http://localhost:5173/studio**  
Demo QR serial: `FL-DEMO-0001`

---

## Deploy to production (Render + Vercel)

Follow these steps **in order**:

### 1. Create a Render Postgres database

In the Render dashboard, create a new **PostgreSQL** instance. Copy the **Internal Database URL** — you'll need it next.

### 2. Deploy the backend on Render

1. Create a new **Web Service**, connect your repo, set root directory to `backend/`.
2. **Build command:** `npm ci && npm run build:prod`
3. **Start command:** `npm run start:prod`
4. **Health check path:** `/api/health`
5. Set these environment variables in the Render dashboard:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Postgres internal URL from step 1 |
| `DB_PROVIDER` | `postgresql` |
| `SERVER_SECRET` | `openssl rand -hex 32` |
| `STUDIO_API_KEY` | `openssl rand -hex 24` |
| `CORS_ORIGIN` | Your Vercel URL (fill in after step 3) |
| `LLM_API_KEY` | Optional — leave blank for template briefs |
| `FAN_RATE_MAX` | `300` |

6. Deploy. Copy the service URL (e.g. `https://fandomloop-india-api.onrender.com`).

> `render.yaml` in the backend directory pre-configures the service. You can also use "Deploy from YAML" in Render.

### 3. Deploy the frontend on Vercel

1. Import the repo on Vercel, set **Root Directory** to `frontend/`.
2. Framework preset: **Vite**. Build command: `npm run build`. Output: `dist`.
3. Add environment variable:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your Render backend URL from step 2 |

4. Deploy. Copy the Vercel URL (e.g. `https://fandomloop.vercel.app`).

### 4. Update CORS_ORIGIN on Render

Go back to the Render dashboard and set `CORS_ORIGIN` to your Vercel URL from step 3, then trigger a redeploy.

### 5. Seed once

```bash
# In the Render shell (Dashboard → Shell), or locally with prod credentials:
DATABASE_URL="<postgres-url>" DB_PROVIDER=postgresql npm run seed:prod
```

Or from the Render web service shell tab.

### 6. Verify with smoke test

```bash
bash backend/scripts/smoke.sh https://fandomloop-india-api.onrender.com
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | `file:./prisma/dev.db` | SQLite path (dev) or Postgres URL (prod) |
| `DB_PROVIDER` | no | `sqlite` | `sqlite` or `postgresql` — patches `schema.prisma` |
| `SERVER_SECRET` | yes | — | HMAC key for pseudonymous IDs. **Never use fallback in production.** |
| `PORT` | no | `4000` | HTTP port |
| `CORS_ORIGIN` | no | `localhost:3000,5173` | Comma-separated allowed origins |
| `STUDIO_API_KEY` | no | *(empty)* | Protects studio endpoints. Leave empty in dev. |
| `LLM_API_KEY` | no | *(empty)* | OpenAI-compatible key. Empty = template brief. |
| `LLM_BASE_URL` | no | `https://api.openai.com/v1` | LLM endpoint |
| `LLM_MODEL` | no | `gpt-4o-mini` | Model name |
| `FAN_RATE_MAX` | no | `300` | Fan route requests per 15 min per IP |
| `TEST_FEE_INR` | no | `10000` | Platform test fee shown in Console |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(empty)* | Backend origin. Empty = Vite proxy (`/api/*` → `localhost:4000`) |

---

## npm scripts

### Backend

| Command | Description |
|---|---|
| `npm run dev` | Start with hot reload |
| `npm run build` | Compile TypeScript (dev) |
| `npm run build:prod` | Patch provider + prisma generate + tsc |
| `npm start` | Run compiled output |
| `npm run start:prod` | `prisma db push` then run compiled output |
| `npm test` | Run all Vitest tests (117 tests) |
| `npm run db:push` | Sync Prisma schema |
| `npm run db:seed` / `npm run seed:prod` | Wipe and re-seed demo data |
| `npm run demo:reset` | Force-reset DB + re-seed |

### Frontend

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve production build locally |

---

## Smoke test

```bash
# Against local dev servers (both must be running):
bash backend/scripts/smoke.sh http://localhost:4000

# Against production:
STUDIO_API_KEY=your-key bash backend/scripts/smoke.sh https://your-api.onrender.com
```

Checks: health, ≥3 campaigns, evaluate-gate GO/ADAPT/STOP, FL-DEMO-0001 verified, FAKE-0000 not verified, POST /api/orders → 404, settle without key → 401.

---

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/campaigns` | — | List campaigns with live stats + ourRevenue |
| `GET` | `/api/campaigns/:slug` | — | Single campaign |
| `POST` | `/api/campaigns` | Studio key | Create campaign |
| `POST` | `/api/campaigns/evaluate-gate` | — | Stateless margin gate |
| `POST` | `/api/campaigns/:slug/settle` | Studio key | Capture or release pledges, issue serials |
| `GET` | `/api/campaigns/:slug/segments` | — | Demand segments |
| `GET` | `/api/campaigns/:slug/sources` | Studio key | Opt-ins grouped by acquisition source |
| `GET` | `/api/campaigns/:slug/scans` | Studio key | Scan analytics + counterfeit list |
| `GET` | `/api/campaigns/:slug/prior` | — | Demand prior (AniList + Trends + dub) |
| `POST` | `/api/campaigns/:slug/insights` | — | Fan comment clusters |
| `POST` | `/api/campaigns/:slug/brief` | — | AI launch brief |
| `POST` | `/api/consent` | Rate limited | Record consent, get pseudonymousId |
| `POST` | `/api/consent/withdraw` | Rate limited | Withdraw data (DPDPA) |
| `POST` | `/api/pledges` | Rate limited | Create pledge |
| `POST` | `/api/pledges/:id/preauthorize` | — | Mock UPI mandate |
| `GET` | `/api/pledges/:id/order` | — | Order status (requires pseudonymousId) |
| `GET` | `/api/verify/:serial` | — | Check serial (used by QR scan) |

Studio key: `X-Studio-Key: <value>` header. Omit in dev when `STUDIO_API_KEY` is empty.

---

## Security notes

- **Pseudonymous IDs:** Raw phone/device IDs never stored. `HMAC-SHA256(identifier, SERVER_SECRET)` truncated to 24 hex chars.
- **Production guard:** The server refuses to start if `SERVER_SECRET` is missing or shorter than 16 chars when `NODE_ENV=production`.
- **Rate limiting:** Fan write routes limited to 300 req/15 min/IP (configurable via `FAN_RATE_MAX`).
- **SPA routing:** `frontend/vercel.json` rewrites all paths to `index.html` so `/verify/:serial` and `/studio` work on direct access and QR scan.
- **CORS:** Only origins in `CORS_ORIGIN` are allowed. Always set this to your exact Vercel URL in production.

---

## Common problems

| Problem | Fix |
|---|---|
| `Cannot GET /` in browser | You opened port 4000 (the API). Open **http://localhost:5173** instead |
| Prisma engine platform error | Run `npx prisma generate` in `backend/` |
| Port already in use | Kill the process using the port |
| Console shows 401 | Enter your `STUDIO_API_KEY` value in the Studio key field and click Save |
| Settle returns 401 | Same as above — the key in the Console field must match `STUDIO_API_KEY` |
| Brief shows "template" | Set `LLM_API_KEY` in `backend/.env` |
| QR not working after deploy | Check `VITE_API_URL` is set on Vercel and the Vercel URL is in `CORS_ORIGIN` on Render |
| Server won't start in production | `SERVER_SECRET` is missing or too short — set it in Render env vars |
