/**
 * scripts/use-provider.mjs
 *
 * Rewrites the `provider` line inside the `datasource db { }` block of
 * prisma/schema.prisma based on the DB_PROVIDER environment variable.
 *
 * Usage (called automatically by `npm run build:prod`):
 *   DB_PROVIDER=postgresql  →  provider = "postgresql"
 *   DB_PROVIDER=sqlite      →  provider = "sqlite"      (default, no-op)
 *   (unset)                 →  provider = "sqlite"      (no-op)
 *
 * Why: Prisma does not support reading the provider from an env variable
 * at schema parse time, so we patch the file before `prisma generate`.
 * The script is idempotent — running it twice produces the same result.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "../prisma/schema.prisma");

const provider = process.env.DB_PROVIDER === "postgresql" ? "postgresql" : "sqlite";

let schema = readFileSync(SCHEMA_PATH, "utf-8");

// Replace only the provider line that sits inside the datasource block.
// We match the block first, then replace the provider value within it.
// This avoids accidentally matching comment lines or the generator block.
const updated = schema.replace(
  /(datasource\s+\w+\s*\{[^}]*?\n[ \t]*provider\s*=\s*)"[^"]+"/,
  `$1"${provider}"`
);

if (updated === schema) {
  console.log(`[use-provider] provider already "${provider}" — no change needed.`);
} else {
  writeFileSync(SCHEMA_PATH, updated, "utf-8");
  console.log(`[use-provider] Set provider = "${provider}" in prisma/schema.prisma`);
}
