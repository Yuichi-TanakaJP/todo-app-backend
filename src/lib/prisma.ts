import "dotenv/config";
import { createDatabaseAdapter } from "./database-adapter.js";
import { PrismaClient } from "../generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function createClient() {
  return new PrismaClient({ adapter: createDatabaseAdapter(process.env.DATABASE_URL), log: ["query", "error", "warn"] });
}
export const prisma = globalForPrisma.prisma ?? createClient();
// Hot reload must reuse the adapter's pool as well as the client.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
export default prisma;
