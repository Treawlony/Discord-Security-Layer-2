import { PrismaClient } from "@prisma/client";

// Singleton Prisma client
export const db = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
});
