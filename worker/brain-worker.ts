/**
 * Brain worker — standalone Node process that drives the Market Core Brain
 * scan loop outside of Vercel's serverless timeouts.
 *
 * Deploy target: a Railway worker service alongside the existing Postgres
 * instance. See worker/README.md for step-by-step deploy instructions.
 *
 * This process imports runScanCycle() directly — no HTTP round trip —
 * so cycles can take as long as they need without hitting any function-
 * duration cap. Memory + CPU are the only bounds.
 */

import { runScanCycle } from "../src/lib/brain/scan";
import { runDailyLearningCycle } from "../src/lib/brain/learning";

const SCAN_INTERVAL_MS = Number(process.env.BRAIN_SCAN_INTERVAL_MS ?? 2 * 60 * 1000);
const LEARN_HOUR_UTC = Number(process.env.BRAIN_LEARN_HOUR_UTC ?? 2); // 02:00 UTC

let running = false;
let shuttingDown = false;
let lastLearnedDate: string | null = null;

function ts(): string {
  return new Date().toISOString();
}

function log(msg: string, extra?: unknown) {
  // Railway captures stdout verbatim; structured-ish lines are enough.
  if (extra !== undefined) {
    console.log(`[${ts()}] ${msg}`, typeof extra === "string" ? extra : JSON.stringify(extra));
  } else {
    console.log(`[${ts()}] ${msg}`);
  }
}

async function runScan() {
  if (running) {
    log("scan-skip · previous cycle still running");
    return;
  }
  if (shuttingDown) return;
  running = true;
  const started = Date.now();
  try {
    const result = await runScanCycle("railway-worker");
    const dur = Date.now() - started;
    log(`scan-done · status=${result.status} · ${dur}ms · candles=${result.candlesWritten} · setups=${result.setupsPersisted} · errors=${result.errors.length}`);
    if (result.errors.length > 0) {
      for (const err of result.errors.slice(0, 5)) log(`  err · ${err}`);
    }
  } catch (e: any) {
    log(`scan-fail · ${e?.message ?? String(e)}`);
  } finally {
    running = false;
  }
}

async function maybeRunLearn() {
  if (shuttingDown) return;
  const now = new Date();
  const hourUtc = now.getUTCHours();
  const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
  if (hourUtc !== LEARN_HOUR_UTC) return;
  if (lastLearnedDate === dateKey) return;
  lastLearnedDate = dateKey;
  log(`learn-start · ${dateKey}`);
  try {
    const result = await runDailyLearningCycle();
    log(`learn-done · ${JSON.stringify(result)}`);
  } catch (e: any) {
    log(`learn-fail · ${e?.message ?? String(e)}`);
  }
}

function handleShutdown(signal: string) {
  log(`shutdown · ${signal}`);
  shuttingDown = true;
  // Give any in-flight cycle up to 60s to finish, then exit.
  const start = Date.now();
  const poll = setInterval(() => {
    if (!running || Date.now() - start > 60_000) {
      clearInterval(poll);
      process.exit(0);
    }
  }, 1_000);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  log(`unhandled-rejection · ${String(reason)}`);
});

async function main() {
  log(`brain-worker · start · interval=${SCAN_INTERVAL_MS}ms · learnAt=${LEARN_HOUR_UTC}:00 UTC`);
  await runScan();
  await maybeRunLearn();
  setInterval(runScan, SCAN_INTERVAL_MS);
  // Check the learn clock every 5 minutes; runLearnCycle dedupes by date.
  setInterval(maybeRunLearn, 5 * 60 * 1000);
}

main().catch((e) => {
  log(`fatal · ${e?.message ?? String(e)}`);
  process.exit(1);
});
