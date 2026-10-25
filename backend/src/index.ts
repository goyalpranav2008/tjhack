import "dotenv/config";
import app from "./app";

// ── Production safety guard ────────────────────────────────────────────────
// Refuse to start in production without a real SERVER_SECRET.
// The fallback "fallback-secret" in pseudonym.ts is only for local dev;
// if it were used in production, all pseudonymous IDs would be trivially reversible.
if (process.env.NODE_ENV === "production") {
  const secret = process.env.SERVER_SECRET;
  if (!secret || secret === "fallback-secret" || secret.length < 16) {
    console.error(
      "FATAL: SERVER_SECRET must be set to a random string of ≥16 characters in production."
    );
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT ?? "4000", 10);

app.listen(PORT, () => {
  console.log(`FandomLoop India API running on http://localhost:${PORT}`);
});
