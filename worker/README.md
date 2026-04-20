# Brain Worker

A standalone Node process that runs the Market Core Brain scan loop
(`runScanCycle`) and the nightly learning cycle (`runDailyLearningCycle`)
outside of Vercel's serverless function timeouts.

## Why this exists

Vercel Pro caps a single function at **300 seconds** and bills per GB-hour.
As the Brain tracks more symbols and more timeframes, a 2-minute scan
cycle can bump up against both ceilings. A long-lived Node process on
Railway has no per-invocation cap and flat monthly pricing.

## Local test

```
npm install
npm run worker:brain
```

Tail the output to confirm scan cycles fire every 2 minutes. Stop with
Ctrl+C — the worker will let any in-flight cycle finish for up to 60s
before exiting.

Required env vars (same as the Next.js app):

- `DATABASE_URL` — Railway Postgres connection string.
- `TWELVEDATA_API_KEY` — market data provider.

Optional:

- `BRAIN_SCAN_INTERVAL_MS` — default `120000` (2 minutes).
- `BRAIN_LEARN_HOUR_UTC` — default `2` (learning fires once when the
  UTC hour equals this value).

## Deploy to Railway

1. **Create a new service** inside your existing Railway project
   (the one that hosts the Postgres instance). Choose "Empty Service"
   → "Deploy from GitHub repo" → this repo.

2. **Set the root directory** to `/` (the repo root — Railway needs
   access to `src/` so the worker can import from the brain modules).

3. **Build command:**
   ```
   npm install && npx prisma generate
   ```

4. **Start command:**
   ```
   npm run worker:brain
   ```

5. **Environment variables** — copy from the Vercel app:
   - `DATABASE_URL`
   - `TWELVEDATA_API_KEY`
   - `NODE_ENV=production`

6. **Deploy.** Watch the logs — you should see a `brain-worker · start`
   line followed by `scan-done · status=completed` every ~2 minutes.

## Transitioning off the Vercel cron

Once the Railway worker is running cleanly for a few hours:

1. Remove or comment out the `/api/brain/scan` entry from
   `vercel.json`:
   ```jsonc
   {
     "crons": [
       // { "path": "/api/brain/scan", "schedule": "*/2 * * * *" },
       { "path": "/api/brain/learn", "schedule": "0 2 * * *" }
     ]
   }
   ```
2. Commit, push, confirm Vercel redeploys.
3. The Vercel function stays reachable (`/api/brain/scan` still works
   for manual invocation from the Agent remediation panel) — only the
   scheduled cron is removed.

Running both the Vercel cron AND the Railway worker simultaneously is
safe but redundant: each cycle takes a DB-level lock via the
`ScanCycle` row, so at most one runs concurrently. The duplicate won't
cause corruption — it's just wasted compute on Vercel.

## When to cut the cord

Move fully to Railway when:

- Scan cycle duration regularly exceeds 60s, OR
- Vercel GB-hours usage is approaching the Pro tier's 1000 GB-hrs/month
  included quota, OR
- You need multiple cron schedules with tight timing (worker supports
  multiple intervals trivially; Vercel cron minimum is 1 minute).
