import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { databaseConfig } from "./database-config.js";
import { withPrismaParsers } from "./native-query-client.js";

export function redactNativePoolErrors(pool: pg.Pool) {
  // pg-pool attaches a complete client to idle errors; adapter debug must never inspect its DSN.
  pool.prependListener("error", (error: Error & { client?: unknown }) => { delete error.client; });
  return pool;
}

export function createDatabaseAdapter(value: string | undefined) {
  const { pool, schema, requiresChannelBinding } = databaseConfig(value);
  if (!requiresChannelBinding) return new PrismaPg(pool, { schema });
  let native;
  try { native = pg.native; } catch { throw new Error("Mandatory channel binding requires pg-native and libpq"); }
  if (!native) throw new Error("Mandatory channel binding requires pg-native and libpq");
  const url = new URL(pool.connectionString!);
  if (!url.searchParams.has("sslrootcert")) {
    const ca = fileURLToPath(new URL("../../dist/native-ca.pem", import.meta.url));
    if (!existsSync(ca)) throw new Error("Native CA bundle missing; run the project build");
    url.searchParams.set("sslrootcert", ca);
  }
  url.searchParams.set("connect_timeout", String(Math.max(2, Math.ceil(pool.connectionTimeoutMillis! / 1000))));
  // libpq percent-decodes URI query components but does not treat + as a space.
  url.search = url.search.replaceAll("+", "%20");
  const { connectionString: _connectionString, ...settings } = pool;
  // Only libpq parses the authoritative URL. The JS parser must not drop channel_binding.
  const nativeSettings = { ...settings, Client: withPrismaParsers(native.Client),
    // Native performs a discarded JS connection-string preflight before using the authoritative URI.
    // Do not let ambient PGHOST/PGUSER/PGPORT affect that preflight.
    host: "127.0.0.1", port: 5432, user: "native-wrapper-unused",
    database: "native-wrapper-unused", password: "native-wrapper-unused",
    nativeConnectionString: url.toString(), ssl: false,
    types: { getTypeParser: () => (value: string) => value },
  };
  const nativePool = redactNativePoolErrors(new pg.Pool(nativeSettings));
  return new PrismaPg(nativePool, { schema, disposeExternalPool: true });
}
