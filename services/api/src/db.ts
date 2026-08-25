import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000
});

export async function healthcheckDb() {
  const result = await pool.query("select now() as now");
  return result.rows[0];
}
