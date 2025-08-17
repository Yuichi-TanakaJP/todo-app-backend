import { PrismaClient } from "@prisma/client";

// 開発中にホットリロードしても複数生成されないようにシングルトン化
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["query", "error", "warn"], // 必要なら調整
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
