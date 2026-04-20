import { NextRequest, NextResponse } from "next/server";
import { fetchCandleSet, CRYPTO_PRIORITY_SYMBOLS } from "@/lib/brain/candles";
import { ensureInstruments } from "@/lib/brain/instruments";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const header = req.headers.get("x-cron-secret");
  if (header === secret) return true;
  return false;
}

/**
 * High-cadence crypto-only candle refresh. Runs every 60 seconds via
 * Vercel cron (vercel.json) so BTC + ETH are always fresh — between
 * the main 2-minute scan cycles.
 *
 * Lightweight on purpose: just candle fetch + persist. Structure,
 * indicators, and downstream analyzers run in the main scan; this
 * cron only feeds them fresher data.
 */
async function refresh() {
  const instruments = await ensureInstruments();
  const symbolToId = new Map(
    instruments.map((i: { symbol: string; id: string }) => [i.symbol, i.id]),
  );
  const result = await fetchCandleSet(symbolToId, { symbols: CRYPTO_PRIORITY_SYMBOLS });
  return {
    ok: true,
    symbols: CRYPTO_PRIORITY_SYMBOLS,
    requests: result.requestCount,
    candlesWritten: result.totalWritten,
    errors: result.results.filter((r) => r.error).map((r) => `${r.symbol} ${r.timeframe}: ${r.error}`),
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const out = await refresh();
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const out = await refresh();
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
