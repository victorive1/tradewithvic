import "dotenv/config";
import { defineConfig } from "prisma/config";

// CLI / migrations must use a *direct* compute connection. Neon's pooled URL
// (`…-pooler.neon.tech`) runs PgBouncer in transaction mode, which breaks
// `prisma migrate` — no advisory locks across pooled sessions, no session-
// level prepared statements. DATABASE_URL_UNPOOLED is the direct endpoint
// Vercel's Neon Marketplace integration auto-injects alongside DATABASE_URL.
//
// Runtime client (src/lib/prisma.ts) is independent: it reads DATABASE_URL
// directly and routes through @prisma/adapter-pg → Neon's pooler.
const cliUrl =
  process.env["DATABASE_URL_UNPOOLED"] ?? process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: cliUrl,
  },
});
