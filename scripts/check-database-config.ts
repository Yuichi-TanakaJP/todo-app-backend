import "dotenv/config";
import { databaseConfig } from "../src/lib/database-config.ts";
import { createDatabaseAdapter } from "../src/lib/database-adapter.ts";

try {
  createDatabaseAdapter(process.env.DATABASE_URL);
  const { pool, requiresChannelBinding } = databaseConfig(process.env.DATABASE_URL);
  const url = new URL(pool.connectionString!);
  // Safe to run on the deployment host: no connection and no URL, host, user, or schema output.
  console.log(JSON.stringify({ valid: true, requiresChannelBinding, tls: url.searchParams.get("sslmode"), poolMax: pool.max,
    connectionTimeoutMillis: pool.connectionTimeoutMillis, idleTimeoutMillis: pool.idleTimeoutMillis }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database configuration is incompatible");
  process.exitCode = 1;
}
