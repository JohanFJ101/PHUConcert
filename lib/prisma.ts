/**
 * Shared PrismaClient instance.
 *
 * Next.js dev mode hot-reloads server modules, which would otherwise create
 * a new `PrismaClient` on every reload and exhaust the database connection
 * pool. We cache the client on `globalThis` so the same instance is reused
 * across reloads in development. In production a fresh client is fine
 * because the server is not reloaded.
 */

import { PrismaClient } from "@prisma/client";

// Casting `globalThis` lets us attach a typed `prisma` property without
// polluting the global type definitions for the whole project.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Keep logs quiet in production; show warnings/errors during dev to
    // surface slow queries and connection issues early.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

// Persist the client on `globalThis` only outside of production so dev-mode
// hot reloads reuse the same connection pool.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
