/**
 * Vitest global setup — runs once before any test file, outside the worker fork.
 * Creates a clean test.db so integration tests never touch dev.db.
 */
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const testDbPath = path.join(__dirname, "../../test.db");

export async function setup() {
  process.env.DATABASE_URL = `file:${testDbPath}`;
  process.env.SERVER_SECRET = "test-secret-for-integration";

  const prismaBin = path.join(__dirname, "../../node_modules/.bin/prisma");
  execSync(`${prismaBin} db push --skip-generate`, {
    env: { ...process.env, DATABASE_URL: `file:${testDbPath}` },
    stdio: "pipe",
  });
}

export async function teardown() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}
