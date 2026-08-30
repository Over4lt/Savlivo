import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL_REQUIRED");
}

const repoRoot = resolve(process.cwd(), "../..");

const files = [
  "db/schema.sql",
  "db/migrations/002_auth.sql",
  "db/migrations/003_billing.sql",
  "db/migrations/004_subscription_status_history.sql",
  "db/migrations/005_status_history_invariants.sql",
  "db/migrations/007_authoritative_provider_pricing.sql",
  "services/api/src/savlivo-migration-savings-ledger-1.7.0.sql",
  "services/api/migrations/20260824_notifications.sql",
];

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();

  for (const file of files) {
    console.log(`Applying ${file}...`);
    const sql = await readFile(resolve(repoRoot, file), "utf8");
    await client.query(sql);
  }

  console.log("Production database initialized successfully.");
} finally {
  await client.end();
}
