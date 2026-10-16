import { Client } from "pg";
import { runProductionMigrations } from "./production-migrations.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error(JSON.stringify({event:"PRODUCTION_MIGRATION_FAILED",code:"DATABASE_URL_REQUIRED"}));
  process.exitCode = 1;
} else {
  const client = new Client({connectionString:databaseUrl});
  try {
    await client.connect();
    const result = await runProductionMigrations(client);
    console.log(JSON.stringify({event:"PRODUCTION_MIGRATION_RUNNER_COMPLETED",...result}));
  } catch (error) {
    const code = error instanceof Error && /^PRODUCTION_MIGRATION_[A-Z_]+$/.test(error.message)
      ? error.message : "PRODUCTION_MIGRATION_DATABASE_FAILURE";
    console.error(JSON.stringify({event:"PRODUCTION_MIGRATION_FAILED",code}));
    process.exitCode = 1;
  } finally {
    await client.end().catch(()=>{});
  }
}
