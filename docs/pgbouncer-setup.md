# PgBouncer Setup — Durable DB Pooling on Railway

**Why this exists:** Before this setup, every Vercel serverless function
opened its own small pool of direct connections to Railway Postgres.
Under real traffic we hit Railway's ~100-connection ceiling and all
pages started returning the Vercel `This page couldn't load` screen
with digest `3366061296`. The short-term fix was capping each function
to 3 connections (commit `e1dcbef`). This document walks the long-term
fix — putting PgBouncer in front of Postgres so pooling happens
server-side.

**What you do, what the code does:**

- You: deploy PgBouncer on Railway, grab its connection URL, paste it
  into Vercel's `DATABASE_URL` env var. ~5 minutes.
- Code: `src/lib/prisma.ts` already auto-detects a pooler URL (by
  hostname, port 6432, or `?pgbouncer=true` param) and raises the
  per-instance pool to `max: 12` with shorter idle timeouts. No code
  change needed on your end.

---

## Step 1 — Deploy PgBouncer alongside your Postgres

1. Open the Railway dashboard → your `tradewithvic` project.
2. **+ New** → **Database** → **Add PgBouncer** (if the option exists
   in your plan), or **+ New** → **Template** → search **PgBouncer** →
   deploy.
3. When prompted, link it to the existing Postgres service so the
   template auto-populates `DATABASES_HOST`, `DATABASES_PORT`,
   `DATABASES_DBNAME`, `DATABASES_USER`, `DATABASES_PASSWORD`.
4. If the template asks for `POOL_MODE`, pick **transaction**
   (the default — fine for us; we don't hold transactions across
   requests).

## Step 2 — Grab the PgBouncer URL

In Railway, click the new PgBouncer service → **Variables** tab → copy
the `DATABASE_URL` (it'll look like
`postgresql://USER:PASS@monorail-proxy-HASH.railway.app:6432/railway`
— note the port `6432`).

## Step 3 — Update Vercel env var

1. Vercel dashboard → `tradewithvic-c61m` project → **Settings** →
   **Environment Variables**.
2. Find `DATABASE_URL`. Before overwriting, copy the current value
   somewhere safe (that's your direct-connection URL — keep it as
   `DIRECT_DATABASE_URL` for migrations).
3. Edit `DATABASE_URL` → paste the PgBouncer URL → apply to
   **Production**, **Preview**, **Development**.
4. **Redeploy** (Vercel dashboard → Deployments → latest → **...** →
   Redeploy) so functions pick up the new env var.

## Step 4 — Keep the direct URL for Prisma migrations

`prisma db push` and `prisma migrate` can't run through PgBouncer in
transaction mode (they need session-level features). Add a second env
var on Vercel (and in your local `.env`):

```
DIRECT_DATABASE_URL=postgresql://USER:PASS@...:5432/railway
```

Then update `prisma/schema.prisma` so the `datasource` block uses it
for migrations:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}
```

(Leave `DATABASE_URL` pointing at PgBouncer — only migrations route
through `directUrl`.)

## Step 5 — Verify

Hit `https://tradewithvic.com/api/brain/execution/state` after the
redeploy. If it returns JSON without a P2037 error, the pooler is
working. You can also keep an eye on `vercel logs tradewithvic.com
--level error` for a few minutes — connection errors should be zero.

---

## Rollback

If anything goes wrong, revert `DATABASE_URL` on Vercel back to the
direct URL and redeploy. The code automatically falls back to the
tight `max: 3` pool. Nothing here is destructive.

## Scaling up further

When you outgrow ~12 concurrent heavy connections per instance (won't
happen for a while), options in order of effort:
1. Raise PgBouncer's `MAX_CLIENT_CONN` and `DEFAULT_POOL_SIZE` env
   vars on the Railway service.
2. Upgrade Railway Postgres plan for a higher `max_connections`
   ceiling.
3. Move to a managed provider with built-in pooling (Neon, Supabase).
