# FandomLoop India — 3-Minute Demo Script

> **Goal:** Show judges that demand signals, fan votes, gate economics, serial issuance, and anti-counterfeit verification all work end-to-end in a real browser.
>
> **Time:** ~3 minutes. Steps are labelled with rough timing.
>
> **Before you start:**
> - Open the Vercel URL in your main browser: **https://fandomloop.vercel.app** (or localhost:5173)
> - Have your phone ready for the QR scan step
> - Studio key is pre-saved in sessionStorage from the first visit to `/studio`

---

## Step (a) — 0:00–0:35 · Studio console: GO / ADAPT / STOP

1. Navigate to **`/studio`** (or click "Studio? Open the console" in the footer).
2. Enter the **Studio API key** in the key field → click **Save** (the button turns green).
3. Point to the headline: three verdict stamps — **GO 1 / ADAPT 1 / STOP 1**.
4. Select the **Monsoon Samurai Tee (₹999)** campaign in the left panel.
5. The Gate result section shows:
   - Stamp: **GO**
   - ✅ Rights cleared · ✅ Margin above gate (20%) · ✅ Minimum run met (100) · ✅ Break-even within cap
   - Contribution ₹259/order, margin 26%, break-even 116 orders
   - **FandomLoop earns** card: test fee ₹10,000 + commission + total
6. Switch to the **Monsoon Samurai Tee (₹799)** campaign → stamp flips to **ADAPT** (margin 14% < 20%).
7. Switch to **Monsoon Samurai Tee (₹499)** → **STOP** (negative contribution −₹106).

> **Talking point:** "The gate is just math — contribution per unit, break-even units, and a margin floor. No guessing."

---

## Step (b) — 0:35–1:00 · Slider: royalty flip

1. Make sure **Monsoon Samurai Tee (₹999)** is selected (GO verdict).
2. Drag the **Royalty** slider from 15% to **25%**.
3. Watch the Gate result update within 250 ms (debounce):
   - Stamp flips to **ADAPT**, contribution drops, reasons show `margin_below_gate`
4. Drag it back to 15% → returns to **GO**.

> **Talking point:** "Studios can test any royalty or price scenario before talking to rights holders."

---

## Step (c) — 1:00–1:30 · Fan vote from a phone

1. On your phone (or a second browser tab), open:
   **`/join?ref=mumbai-comic-con`**
2. Vote through the 4 questions (city, language, format, price) — choose **Mumbai** and **₹900 and above**.
3. On the final step, tick "I am 18 or older" + the consent checkbox → tap **Send my vote**.
4. Back in the Console on your laptop, click **Refresh** in the Campaign sidebar.
5. In the **"Opt-ins by source"** bar chart, the `mumbai-comic-con` bar has grown.

> **Talking point:** "Every share link carries a `?ref=` tag. We know which event or creator drove each fan."

---

## Step (d) — 1:30–1:45 · Fan preorder

1. On the phone (or new tab), open **`/preorder`**.
2. Select **Monsoon Samurai Tee (₹999)** → tick age + consent → tap **Reserve ₹999**.
3. The "Reserved!" screen appears: "You are not charged unless the goal is reached."
4. My reservations → shows **Waiting** (no serial yet — settlement hasn't happened).

> **Talking point:** "No money moves until the studio settles. UPI mandate is simulated here."

---

## Step (e) — 1:45–2:10 · Settle and issue serials

1. Back in the Console, select **Monsoon Samurai Tee (₹999)**.
2. Click **Settle campaign**.
3. The result panel shows:
   - Stamp **GO**
   - "110 pledges captured — **110 serials** issued"
   - FandomLoop earns panel updates with commission
4. On the phone, pull-to-refresh **My reservations** → status flips from **Waiting** to **Confirmed** with a QR code and serial number.

> **Talking point:** "Serials are generated atomically in one DB transaction — no race conditions, no forgery."

---

## Step (f) — 2:10–2:35 · Scan the QR on a second device

1. Show the QR code on the phone screen.
2. Scan it with a second phone camera (or use the **Verify** tab and type the serial).
3. The `/verify` page shows the green **"Verified official"** card with item, batch, and seller details.
4. Back in the Console, open the **Scans** card → **Valid scans: 1**.

> **Talking point:** "Any phone can scan the QR — it hits a public endpoint and logs the scan with an IP hash, never the raw IP."

---

## Step (g) — 2:35–3:00 · Counterfeit detection

1. On any browser, go to **`/verify`** and type a fake serial, e.g. `FL-2026-DEADBEEF`.
2. The page shows the red **"Doesn't check out"** card.
3. Back in the Console, **Scans** → **Invalid scans: 1** — the serial appears in **"Possible counterfeits"** with timestamp.
4. If you scan a real serial more than 10 times it is flagged **suspicious: true** (shown with a warning badge in the Console scans list).

> **Talking point:** "Studios can spot grey-market copies the moment a fan tries to verify a fake."

---

## Fallback plan (if network fails)

| Problem | What to say / do |
|---|---|
| API unreachable | "The backend is on Render free tier — it may be sleeping. Health check: `curl https://your-api.onrender.com/api/health`" |
| Render sleeping | Open the URL in a browser to wake it; free tier cold starts take ~30 s |
| Vercel deploy broken | Run locally: `cd backend && npm run dev` and `cd frontend && npm run dev` |
| Database empty | Run `npm run demo:reset` in `backend/` — resets and re-seeds in ~10 s |
| Settle already done | The 999-campaign status is GO; run `npm run demo:reset` to get fresh TESTING campaigns |
| QR won't scan | Type the serial manually: `FL-DEMO-0001` (always present, never reset) |
| Studio key rejected | Check Render env vars for `STUDIO_API_KEY`; paste exact value into the Console key field |

### Reset and re-seed

```bash
cd backend
npm run demo:reset
# Equivalent to: prisma db push --force-reset && tsx src/seed.ts
# Takes ~10 seconds. Re-creates all 3 campaigns + 370 pledges + FL-DEMO-0001.
```

After reset, the campaigns are back in **TESTING** status with 110/105/100 PREAUTHORIZED pledges — ready to settle again.

---

## Expected gate verdicts after seed

| Campaign slug | Price | Committed | Expected verdict on settle |
|---|---|---|---|
| `monsoon-samurai-tee-999` | ₹999 | 110 | **GO** — contribution ₹259, margin 26%, break-even 116 |
| `monsoon-samurai-tee` | ₹799 | 105 | **ADAPT** — margin 14% < 20% gate |
| `monsoon-samurai-tee-499` | ₹499 | 100 | **STOP** — contribution −₹106 |
