import { isAbsolute, resolve } from "node:path";
import type { PoolConfig } from "pg";

export function validatedDatabaseUrl(value: string | undefined): URL {
  if (!value) throw new Error("DATABASE_URL is required");
  if (/[\u0000-\u0020\u007f]/.test(value)) throw new Error("DATABASE_URL contains unsupported characters");
  if (/%(?![0-9a-fA-F]{2})|%00/i.test(value)) throw new Error("DATABASE_URL contains invalid encoding");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("DATABASE_URL must be a PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  const params = url.searchParams;
  const allowed = new Set(["sslmode", "sslrootcert", "channel_binding", "schema", "connection_limit", "connect_timeout", "pool_timeout", "max_idle_connection_lifetime", "max_connection_lifetime", "pgbouncer", "application_name"]);
  if (!url.hostname || [...params.keys()].some(key => !allowed.has(key))) {
    throw new Error("DATABASE_URL has an unsupported connection option");
  }
  if (new Set(params.keys()).size !== [...params.keys()].length) {
    throw new Error("DATABASE_URL has duplicate connection options");
  }
  if (params.has("sslrootcert")) {
    const ca = params.get("sslrootcert");
    if (!ca || !isAbsolute(ca)) throw new Error("sslrootcert must be an absolute CA path");
    params.set("sslrootcert", resolve(ca));
  }
  if (params.has("channel_binding") && params.get("channel_binding") !== "require") {
    throw new Error("Only mandatory channel binding is supported when configured");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const mode = params.get("sslmode") ?? (local ? "disable" : "verify-full");
  if (params.has("ssl") || params.has("uselibpqcompat") || params.has("sslaccept") ||
      !["disable", "prefer", "require", "verify-ca", "verify-full"].includes(mode) ||
      (mode === "disable" && !local)) {
    throw new Error("DATABASE_URL must retain certificate verification; plaintext is loopback-only");
  }
  if (params.has("channel_binding") && mode === "disable") {
    throw new Error("Mandatory channel binding requires TLS");
  }
  if (mode !== "disable" && process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("TLS certificate verification must not be disabled");
  }
  // pg's libpq compatibility mode changes the meaning of require. Pin verification explicitly.
  params.set("sslmode", mode === "disable" ? "disable" : "verify-full");
  return url;
}

export function prismaCliUrl(value: string): string {
  const url = validatedDatabaseUrl(value);
  if (url.searchParams.get("sslmode") !== "disable") {
    // Prisma Migrate uses the Rust connector, whose strict TLS option differs from pg.
    url.searchParams.set("sslmode", "require");
    url.searchParams.set("sslaccept", "strict");
    const ca = url.searchParams.get("sslrootcert");
    if (ca) { url.searchParams.set("sslcert", ca); url.searchParams.delete("sslrootcert"); }
  }
  return url.toString();
}

export function databaseConfig(value: string | undefined): { pool: PoolConfig; schema: string; requiresChannelBinding: boolean } {
  const url = validatedDatabaseUrl(value);
  const params = url.searchParams;
  const number = (key: string, fallback: number, allowZero = false): number => {
    const text = params.get(key);
    params.delete(key);
    if (text === null) return fallback;
    if (!/^\d+$/.test(text)) throw new Error(`Invalid database option: ${key}`);
    const n = Number(text);
    if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1) || n > 2_147_483) {
      throw new Error(`Invalid database option: ${key}`);
    }
    return n;
  };
  const max = number("connection_limit", 10);
  const connect = number("connect_timeout", 5);
  const acquire = number("pool_timeout", 10);
  const idle = number("max_idle_connection_lifetime", 300, true);
  const lifetime = number("max_connection_lifetime", 0, true);
  const schema = params.get("schema") ?? "public";
  params.delete("schema");
  // The JS adapter uses unnamed statements by default, including behind PgBouncer.
  params.delete("pgbouncer");
  return { schema, requiresChannelBinding: params.get("channel_binding") === "require", pool: {
    connectionString: url.toString(), max,
    // pg has a single connect/acquire timer; retain a bounded wait for both paths.
    connectionTimeoutMillis: Math.min(connect, acquire) * 1000,
    idleTimeoutMillis: idle * 1000, maxLifetimeSeconds: lifetime,
  } };
}
