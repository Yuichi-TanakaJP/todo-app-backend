import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { databaseConfig } from "./database-config.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function createClient() {
  const { pool, schema } = databaseConfig(process.env.DATABASE_URL);
  return new PrismaClient({ adapter: new PrismaPg(pool, { schema }), log: ["query", "error", "warn"] });
}
export const prisma = globalForPrisma.prisma ?? createClient();
// Hot reload must reuse the adapter's pool as well as the client.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
export default prisma;
