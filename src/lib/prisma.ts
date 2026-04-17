// Prisma 7 with SQLite uses the datasource from prisma.config.ts
// We lazy-load to avoid build-time initialization issues
let _prisma: any;

export function getPrisma() {
  if (!_prisma) {
    // Dynamic import at runtime
    const { PrismaClient } = require("@/generated/prisma/client");
    _prisma = new PrismaClient();
  }
  return _prisma;
}

// For convenience - creates on first access
export const prisma = new Proxy({} as any, {
  get(_target, prop) {
    return getPrisma()[prop];
  },
});
