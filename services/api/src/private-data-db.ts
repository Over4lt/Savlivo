import pg from "pg";
// Separate bounded pool prevents optional reporting/event work from occupying customer request connections.
export const privateDataPool = new pg.Pool({connectionString:process.env.DATABASE_URL,
  max:2, connectionTimeoutMillis:1500, idleTimeoutMillis:10_000, statement_timeout:3000});

// pg emits idle-client failures on the pool; an unhandled error could terminate the API.
privateDataPool.on("error", () => {
  console.warn("Optional private-data database connection failed.");
});
