# FandomLoop India

Demand-testing platform for licensed anime merchandise. Studios run campaigns to gauge fan interest before committing to a production run. Fans vote, preorder, and verify official items — all anonymously.

---

## Architecture

```
tjhack/
  backend/    Node.js · Express · Prisma · SQLite (dev) / Postgres (prod)
  frontend/   React · Vite · Tailwind CSS
```

```
Fan browser  ──POST /api/consent──►  Express API  ──►  Prisma  ──►  SQLite / Postgres
             ──POST /api/pledges──►
             ──POST /api/orders──►
             ──GET  /api/verify/:serial──►

Studio browser ──GET  /api/campaigns──►  Express API
               ──POST /api/campaigns/:slug/insights──►  AI cluster module
               ──POST /api/campaigns/:slug/brief──►     LLM (optional) or template
               ──POST /api/campaigns/:slug/settle──►    (requires X-Studio-Key)
```

---

## Quick start (local dev)

**Requirements:** Node.js 20+

```bash
# 1. Install dependencies
cd backend  && npm install
cd ../frontend && npm install

# 2. Set up the backend database
cd backend
npm run db:push    # creates prisma/dev.db
npm run db:seed    # demo campaigns, pledges, sellers, FL-DEMO-0001 order

# 3. Start both servers in separate terminals
cd backend  && npm run dev   # → http://localhost:4000
cd frontend && npm run dev   # → http://localhost:5173
```

Open **http://localhost:5173** in your browser.  
Studio console is at **http://localhost:5173/studio**.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | `file:./prisma/dev.db` for SQLite; Postgres connection string for production |
| `SERVER_SECRET` | yes | HMAC key for pseudonymous ID generation — change before production |
| `PORT` | no | HTTP port, defaults to 4000 |
| `CORS_ORIGIN` | no | Comma-separated allowed frontend origins. Defaults to `localhost:3000,5173` |
| `STUDIO_API_KEY` | no | Protects `POST /api/campaigns` and `POST /api/campaigns/:slug/settle`. Leave empty in dev to bypass. |
| `LLM_API_KEY` | no | OpenAI-compatible API key. Leave empty to use the template brief fallback. |
| `LLM_BASE_URL` | no | LLM API base URL. Default: `https://api.openai.com/v1` |
| `LLM_MODEL` | no | Model name. Default: `gpt-4o-mini` |

Copy `backend/.env.example` to `backend/.env` and fill in the values.

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(empty)* | Backend origin. Leave empty in dev — Vite proxy handles `/api/*`. Set to deployed backend URL in production. |

---

## npm scripts

### Backend

| Command | What it does |
|---|---|
| `npm run dev` | Start with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output (production) |
| `npm test` | Run all Vitest tests |
| `npm run db:push` | Sync Prisma schema to the database |
| `npm run db:seed` | Wipe and re-seed demo data |
| `npm run demo:reset` | Force-reset database + re-seed in one command |

### Frontend

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server on port 5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |

---

## Deploying to production

### Switch Prisma to Postgres

1. In `backend/prisma/schema.prisma` change `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL` to your Postgres connection string (Render, Supabase, Railway, Neon, etc.).
3. Run `npm run db:push` (or `prisma migrate deploy` if using migrations).

The schema is already Postgres-compatible — column values for all String enums are identical.

---

### Deploy backend on Render

1. Create a new **Web Service** → connect your repo → select the `backend/` directory.
2. **Build command:** `npm install && npm run build && npx prisma generate && npx prisma db push`
3. **Start command:** `npm start`
4. Add environment variables in the Render dashboard:
   ```
   DATABASE_URL=postgresql://...
   SERVER_SECRET=<long random string>
   STUDIO_API_KEY=<long random string>
   CORS_ORIGIN=https://your-frontend.vercel.app
   LLM_API_KEY=<optional>
   ```
5. Copy the service URL (e.g. `https://fandomloop.onrender.com`).

---

### Deploy frontend on Vercel

1. Import the repo → set **Root Directory** to `frontend`.
2. Framework preset: **Vite**. Build command: `npm run build`. Output: `dist`.
3. Add environment variable:
   ```
   VITE_API_URL=https://fandomloop.onrender.com
   ```
4. Deploy. `vercel.json` already handles SPA routing so `/verify/FL-2026-XXXX` works when scanned from a QR code on any device.

---

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/campaigns` | — | List campaigns with live stats |
| `GET` | `/api/campaigns/:slug` | — | Single campaign |
| `POST` | `/api/campaigns` | Studio key | Create campaign |
| `POST` | `/api/campaigns/evaluate-gate` | — | Stateless margin gate evaluation |
| `POST` | `/api/campaigns/:slug/settle` | Studio key | Capture or release pledges |
| `GET` | `/api/campaigns/:slug/segments` | — | Demand segments |
| `POST` | `/api/campaigns/:slug/insights` | — | Fan comment clusters (keyword heuristic) |
| `POST` | `/api/campaigns/:slug/brief` | — | AI launch brief (LLM or template) |
| `POST` | `/api/consent` | Rate limited | Record consent, get pseudonymousId |
| `POST` | `/api/pledges` | Rate limited | Create pledge (one per pseudonymousId per campaign) |
| `POST` | `/api/pledges/:id/preauthorize` | — | Mock UPI mandate |
| `POST` | `/api/orders` | — | Register an order, get FL-YYYY-XXXX serial |
| `GET` | `/api/verify/:serial` | — | Check if a serial is registered (used by QR scan) |

Studio key is sent as `X-Studio-Key: <value>` header. Omit in dev when `STUDIO_API_KEY` is empty.

---

## Security notes

- **Pseudonymous IDs:** Raw phone numbers or device IDs are never stored. `HMAC-SHA256(identifier, SERVER_SECRET)` truncated to 24 hex chars is stored instead.
- **Rate limiting:** `POST /api/consent` and `POST /api/pledges` are limited to 30 requests per IP per 15 minutes.
- **Duplicate pledges:** One pledge per `pseudonymousId` per campaign is enforced at the database query level.
- **Age verification:** The fan vote form collects `ageConfirmed` (18+) or `guardianConsent` (under 18) before submitting to `POST /api/consent`. The backend rejects consent records that have neither.
- **CORS:** Only origins listed in `CORS_ORIGIN` are allowed. Set this to your production frontend URL.

---

## Common problems

| Problem | Fix |
|---|---|
| `Cannot GET /` in browser | You opened port 4000 (the API). Open **http://localhost:5173** instead |
| Prisma engine platform error | Run `npx prisma generate` in `backend/` |
| `permission denied` on npm scripts | Run `find node_modules/.bin -type f \| xargs chmod +x` in the affected folder |
| Port already in use | `lsof -ti:4000 \| xargs kill` or `lsof -ti:5173 \| xargs kill` |
| `skyblade-chronicles` campaign not found | Run `npm run db:seed` in `backend/` |
| Brief shows "template" | Set `LLM_API_KEY` in `backend/.env` |
| Studio operations return 401 | Add your `STUDIO_API_KEY` value in the Studio key field in `/studio` |
