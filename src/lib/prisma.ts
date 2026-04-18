import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Lazy singleton: only touches DATABASE_URL on first actual DB call.
// Next.js 16's build-time "collect page data" phase imports route modules
// without running their handlers. Anything that reads process.env at module
// scope must be deferred, or the build fails before env vars apply at runtime.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. This Prisma client should only be constructed at request time, not build time."
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function resolveClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = createClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  } else {
    // In production serverless, hold a per-instance singleton so reused warm
    // instances share the client and connection pool.
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = resolveClient();
    const value = Reflect.get(client as any, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function getPrisma(): PrismaClient {
  return resolveClient();
}
