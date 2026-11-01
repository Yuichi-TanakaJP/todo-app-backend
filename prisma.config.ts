import "dotenv/config";
import { defineConfig } from "prisma/config";
import { prismaCliUrl } from "./src/lib/database-config.ts";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation needs no DB secret; migrate still fails without a configured datasource.
  ...(process.env.DATABASE_URL ? { datasource: { url: prismaCliUrl(process.env.DATABASE_URL) } } : {}),
});
