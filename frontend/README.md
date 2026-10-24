# FandomLoop India - frontend

React + Vite + Tailwind. Two products in one app: a bright, phone-first fan app (vote, preorder, verify) and a dark studio console with verdict stamps, live sliders and charts.

All data is illustrative and lives in the browser, so the demo works without a backend.

## Run it (first time)

1. Install Node.js (the LTS version) from https://nodejs.org if `node -v` shows nothing in your terminal.
2. Unzip this folder and open it in VS Code or Cursor (File, Open Folder).
3. Open the terminal in the editor and run:

```bash
npm install
npm run dev
```

4. Open the link the terminal prints (usually http://localhost:5173). Leave the terminal running. The page refreshes each time you save a file.

## Pages

| Route | What it does |
|---|---|
| `/` | Fan home: one hero, a vote button, shortcuts to preorder and verify |
| `/join` | Fan vote: one question per screen, then an optional comment and a required consent checkbox |
| `/studio` | Studio console (dark): verdict counts, assumption sliders, verdict table, charts, detail drawer |
| `/preorder` | Simulated UPI payment, then a QR code for the item |
| `/verify` and `/verify/:serial` | Checks an item code. `FL-DEMO-0001` always verifies |

## Where things live

```
src/
  data/combos.js        sample cities, languages, formats, prices (edit this to change the demo)
  lib/verdict.js        GO / ADAPT / STOP rules and default assumptions
  lib/storage.js        saves opt-ins and orders in the browser, can POST to a backend
  lib/format.js         rupee and number formatting
  fan/                  Bright fan app: FanLayout, Home, Vote, Preorder, Verify
  components/           Studio console parts: VerdictStamp, Slider, Charts, DetailDrawer, Layout
  pages/                Console (studio only)
```

## Connect the backend later

1. Copy `.env.example` to `.env` and set `VITE_API_URL` to the backend URL (no trailing slash).
2. The fan form then also sends `POST /optins`, and the preorder sends `POST /orders` (see `src/lib/storage.js`). The field names match what you see in `Join.jsx` and `Preorder.jsx`. Agree on them in the team's CONTRACT.md.
3. To show real verdicts, replace the `COMBOS` import in `src/pages/Console.jsx` with data fetched from `GET /verdicts`. The table, charts and drawer only need the same fields as `COMBOS` plus `verdict`, `reason` and `next`.
4. Keep `src/lib/verdict.js` and the backend's verdict function in sync, or move the rules fully to the backend.

## Demo flow (about 3 minutes)

1. Open `/studio` and read the three counts: 4 GO, 4 ADAPT, 2 STOP.
2. Click "Stress test: royalty at 25%". Watch stamps flip and the counts change.
3. Click a row to open the drawer and show the reasoning and per-order breakdown.
4. Open `/join` on a phone, submit, then refresh `/studio` to see the new opt-in.
5. Open `/preorder`, pay with any UPI ID like `fan@upi`, then open the verify page.
6. Open `/verify/FL-DEMO-0001` for a code that works on any device.

## Deploy

```bash
npm run build
```

On Vercel, import the repository. `vercel.json` already handles page refreshes on sub-routes.

## Common problems

- `command not found: npm`: install Node.js, then reopen the terminal.
- Blank page: look at the terminal for a red error, then the browser console (right-click, Inspect, Console).
- Port already in use: stop the other server with Ctrl + C, or open the other port the terminal prints.
- Charts look empty: run `npm install` again so `react-is` installs.
