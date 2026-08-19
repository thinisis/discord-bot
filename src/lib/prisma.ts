import { PrismaClient } from "@prisma/client";

declare global {
  var __discordBotPrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__discordBotPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__discordBotPrisma__ = prisma;
}
