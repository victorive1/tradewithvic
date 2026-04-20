import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Lazy singleton: only touches DATABASE_URL on first actual DB call.
// Next.js 16's build-time "collect page data" phase imports route modules
// without running their handlers. Anything that reads process.env at module
// scope must be deferred, or the build fails before env vars apply at runtime.
//
// Pool limits for serverless: Railway Postgres caps at ~100 concurrent
// connections. Each Vercel function instance spawns its own Prisma client
// and node-postgres Pool. With pg's default max=10, ~10 warm instances are
// enough to exhaust Railway's limit — we saw repeated P2037
// "TooManyConnections" faults under real traffic. Capping max=3 with a
// short idle-timeout lets ~30 serverless instances coexist safely, which
// is plenty of headroom for cron + live browsing. This is a temporary
// measure until a real pooler (PgBouncer / Prisma Accelerate) is wired in.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. This Prisma client should only be constructed at request time, not build time."
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      // Kill a single connection that's been open more than 30 min — forces
      // recycling so we don't accumulate zombies in long-lived serverless
      // warm starts.
      maxLifetimeSeconds: 1800,
    }),
  });
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
