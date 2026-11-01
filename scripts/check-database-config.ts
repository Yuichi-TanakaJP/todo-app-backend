import "dotenv/config";
import { databaseConfig } from "../src/lib/database-config.ts";

try {
  const { pool } = databaseConfig(process.env.DATABASE_URL);
  const url = new URL(pool.connectionString!);
  // Safe to run on the deployment host: no connection and no URL, host, user, or schema output.
  console.log(JSON.stringify({ valid: true, tls: url.searchParams.get("sslmode"), poolMax: pool.max,
    connectionTimeoutMillis: pool.connectionTimeoutMillis, idleTimeoutMillis: pool.idleTimeoutMillis }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database configuration is incompatible");
  process.exitCode = 1;
}
