import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    // Fallback so `prisma generate` works without a .env (e.g. CI/build).
    url: process.env.DATABASE_URL ?? "postgresql://barber:barber@localhost:5434/barber",
  },
});
