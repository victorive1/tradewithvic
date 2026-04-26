import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Candle {
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface EngulfingSetup {
  key: string;
  symbol: string;
  displayName: string;
  category: string;
  timeframe: string;
  direction: "bullish" | "bearish";
  decimals: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  rr: number;
  eps: number;
  scoring: { LQ: number; LOC: number; MOM: number; VOL: number; TIME: number };
  session: string;
  reason: string;
  postedAt: Date;
}

const TIMEFRAMES = ["15min", "1h", "4h"] as const;
const MIN_EPS = 0.55;
const MAX_AGE_HOURS: Record<string, number> = { "15min": 4, "1h": 12, "4h": 48 };

function sessionAt(date: Date): { name: string; score: number } {
  const h = date.getUTCHours();
  if (h >= 12 && h < 16) return { name: "London/NY overlap", score: 1.0 };
  if (h >= 7 && h < 12) return { name: "London", score: 0.9 };
  if (h >= 13 && h < 21) return { name: "New York", score: 0.85 };
  if (h >= 0 && h < 8) return { name: "Asia", score: 0.7 };
  return { name: "Off-session", score: 0.5 };
}

function timeAgo(d: Date): string {
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 30) return "just now";
  if (s < 60) return `${s}${s === 1 ? "sec" : "secs"} ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}${m === 1 ? "min" : "mins"} ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  const hPart = `${h}${h === 1 ? "hr" : "hrs"}`;
  if (h < 24) return rem === 0 ? `${hPart} ago` : `${hPart} ${rem}${rem === 1 ? "min" : "mins"} ago`;
  const d2 = Math.floor(h / 24);
  return `${d2}${d2 === 1 ? "day" : "days"} ago`;
}

/**
 * Elite Pattern Score (EPS) — weights:
 *   LQ 0.30  Liquidity sweep / stop-hunt evidence
 *   LOC 0.25 Location in recent range
 *   MOM 0.20 Body-size ratio vs prior candle
 *   VOL 0.15 Current range vs N-bar average
 *   TIME 0.10 Session quality
 *
 * Everything is derived from the closed-candle window we loaded — no
 * hardcoded values. If a dimension can't be computed it defaults to 0.5
 * so one missing feature doesn't blow the whole score to zero.
 */
function detectEngulfing(
  candles: Candle[],
  symbol: string,
  timeframe: string,
  inst: { displayName: string; category: string; decimals: number },
): EngulfingSetup | null {
  if (candles.length < 5) return null;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const window = candles.slice(-20, -1); // prior 19, excluding current

  const currBody = curr.close - curr.open;
  const prevBody = prev.close - prev.open;

  const isBullishEngulf =
    prevBody < 0 && currBody > 0 &&
    curr.open <= prev.close && curr.close >= prev.open &&
    Math.abs(currBody) > Math.abs(prevBody) * 1.05;

  const isBearishEngulf =
    prevBody > 0 && currBody < 0 &&
    curr.open >= prev.close && curr.close <= prev.open &&
    Math.abs(currBody) > Math.abs(prevBody) * 1.05;

  if (!isBullishEngulf && !isBearishEngulf) return null;

  const direction: "bullish" | "bearish" = isBullishEngulf ? "bullish" : "bearish";

  // LQ — did the engulfing candle sweep recent swing low/high?
  const lookbackLow = Math.min(...window.map((c) => c.low));
  const lookbackHigh = Math.max(...window.map((c) => c.high));
  const LQ = direction === "bullish"
    ? curr.low < lookbackLow ? 1.0 : Math.min(1, Math.max(0, 0.5 + (lookbackLow - curr.low) / (lookbackHigh - lookbackLow + 1e-9)))
    : curr.high > lookbackHigh ? 1.0 : Math.min(1, Math.max(0, 0.5 + (curr.high - lookbackHigh) / (lookbackHigh - lookbackLow + 1e-9)));

  // LOC — closing price sits where in the recent range?
  const range = lookbackHigh - lookbackLow + 1e-9;
  const posInRange = (curr.close - lookbackLow) / range;
  const LOC = direction === "bullish"
    ? Math.min(1, Math.max(0, 1 - posInRange * 1.4))   // want low in range
    : Math.min(1, Math.max(0, posInRange * 1.4));      // want high in range

  // MOM — current body vs prior body ratio, capped at 3x
  const bodyRatio = Math.min(3, Math.abs(currBody) / (Math.abs(prevBody) + 1e-9));
  const MOM = Math.min(1, 0.4 + (bodyRatio - 1) * 0.3);

  // VOL — current range vs average of prior window ranges
  const avgRange = window.reduce((a, c) => a + (c.high - c.low), 0) / Math.max(1, window.length);
  const VOL = Math.min(1, (curr.high - curr.low) / (avgRange + 1e-9) * 0.5);

  const { name: sessionName, score: TIME } = sessionAt(curr.closeTime);

  const eps = LQ * 0.30 + LOC * 0.25 + MOM * 0.20 + VOL * 0.15 + TIME * 0.10;

  // Entry / SL / TP
  const buffer = avgRange * 0.1;
  const entry = curr.close;
  const stopLoss = direction === "bullish"
    ? Math.min(curr.low, prev.low) - buffer
    : Math.max(curr.high, prev.high) + buffer;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === "bullish" ? entry + 2 * risk : entry - 2 * risk;
  const rr = risk > 0 ? Math.abs(takeProfit - entry) / risk : 0;

  const reason = `${direction === "bullish" ? "Bullish" : "Bearish"} engulfing on ${timeframe} after ${
    LQ > 0.8 ? "liquidity sweep" : LQ > 0.5 ? "partial sweep" : "no sweep"
  }; body ${bodyRatio.toFixed(1)}x prior · range ${((curr.high - curr.low) / (avgRange + 1e-9)).toFixed(1)}x avg · ${sessionName}.`;

  return {
    key: `${symbol}:${timeframe}`,
    symbol,
    displayName: inst.displayName,
    category: inst.category,
    timeframe,
    direction,
    decimals: inst.decimals,
    entry,
    stopLoss,
    takeProfit,
    rr,
    eps,
    scoring: { LQ, LOC, MOM, VOL, TIME },
    session: sessionName,
    reason,
    postedAt: curr.closeTime,
  };
}

async function loadSetups(): Promise<EngulfingSetup[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const rows = await prisma.candle.findMany({
    where: { timeframe: { in: [...TIMEFRAMES] }, isClosed: true, closeTime: { gte: cutoff } },
    orderBy: [{ symbol: "asc" }, { timeframe: "asc" }, { closeTime: "asc" }],
  });
  const grouped = new Map<string, Candle[]>();
  for (const r of rows) {
    const key = `${r.symbol}:${r.timeframe}`;
    const arr = grouped.get(key) ?? [];
    arr.push({
      openTime: r.openTime,
      closeTime: r.closeTime,
      open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
    });
    grouped.set(key, arr);
  }
  const results: EngulfingSetup[] = [];
  for (const [key, arr] of grouped) {
    const [symbol, tf] = key.split(":");
    const inst = ALL_INSTRUMENTS.find((i) => i.symbol === symbol);
    if (!inst) continue;
    const setup = detectEngulfing(arr, symbol, tf, {
      displayName: inst.displayName,
      category: inst.category,
      decimals: inst.decimals,
    });
    if (!setup) continue;
    if (setup.eps < MIN_EPS) continue;
    const ageMs = Date.now() - setup.postedAt.getTime();
    const maxAgeMs = (MAX_AGE_HOURS[tf] ?? 24) * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) continue;
    results.push(setup);
  }
  results.sort((a, b) => b.eps - a.eps);
  return results;
}

function EPSMeter({ eps }: { eps: number }) {
  const pct = Math.round(eps * 100);
  const color = pct >= 75 ? "bg-bull" : pct >= 60 ? "bg-accent" : "bg-warn";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold font-mono text-foreground">{eps.toFixed(2)}</span>
    </div>
  );
}

function fmt(val: number, dec: number): string {
  return val.toFixed(dec);
}

export default async function EngulfingPage() {
  const setups = await loadSetups();

  return (
    <div className="space-y-6">
      <AdminRiskTargetBar />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Engulfing Candle Detector</h1>
        <p className="text-sm text-muted mt-1">
          Live detection on the last closed candle per symbol across 15min / 1h / 4h, scored by the
          EPS formula: Liquidity + Location + Momentum + Volatility + Session.
        </p>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">EPS Formula</h3>
        <code className="text-xs text-accent-light bg-surface-2 px-3 py-1.5 rounded-lg inline-block">
          EPS = (LQ × 0.30) + (LOC × 0.25) + (MOM × 0.20) + (VOL × 0.15) + (TIME × 0.10)
        </code>
        <div className="flex gap-4 mt-3 text-xs text-muted flex-wrap">
          <span>EPS ≥ 0.75 = <strong className="text-bull-light">High probability</strong></span>
          <span>0.60–0.74 = <strong className="text-accent-light">Medium</strong></span>
          <span>0.55–0.59 = <strong className="text-warn">Watch</strong></span>
        </div>
      </div>

      {setups.length === 0 ? (
        <div className="glass-card p-10 text-center space-y-3">
          <div className="text-4xl opacity-70">🕯️</div>
          <h3 className="text-sm font-semibold text-foreground">No qualifying engulfings right now</h3>
          <p className="text-xs text-muted max-w-md mx-auto">
            The detector scans every instrument&apos;s last closed candle on 15min, 1h, and 4h. A
            setup appears here when the current candle engulfs the prior one&apos;s body, the
            EPS score clears 0.55, and the pattern is recent enough to still be tradeable.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {setups.map((setup) => {
            const isBull = setup.direction === "bullish";
            return (
              <div key={setup.key} className="glass-card overflow-hidden">
                <div className={cn("h-1.5", isBull ? "bg-bull" : "bg-bear")} />
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-bold">{setup.displayName}</h3>
                      <span className={cn(
                        "text-xs font-bold px-2.5 py-1 rounded-full",
                        isBull ? "bg-bull/10 text-bull-light" : "bg-bear/10 text-bear-light",
                      )}>
                        {isBull ? "Bullish Engulfing" : "Bearish Engulfing"}
                      </span>
                      <span className="text-xs bg-surface-2 px-2 py-1 rounded">{setup.timeframe}</span>
                      <span className="text-xs bg-surface-2 px-2 py-1 rounded">{setup.session}</span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-light bg-accent/10 border border-accent/30 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-light" />
                        Posted {timeAgo(setup.postedAt)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted mb-1">EPS Score</div>
                      <EPSMeter eps={setup.eps} />
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-3 mb-4">
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-accent-light uppercase mb-1">Entry</div>
                      <div className="text-sm font-bold font-mono">{fmt(setup.entry, setup.decimals)}</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-bear-light uppercase mb-1">Stop</div>
                      <div className="text-sm font-bold font-mono text-bear-light">{fmt(setup.stopLoss, setup.decimals)}</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-accent-light uppercase mb-1">1R Target</div>
                      <div className="text-sm font-bold font-mono text-accent-light">{fmt(computeOneR(setup.entry, setup.stopLoss, setup.direction), setup.decimals)}</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-bull-light uppercase mb-1">Target</div>
                      <div className="text-sm font-bold font-mono text-bull-light">{fmt(setup.takeProfit, setup.decimals)}</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-muted uppercase mb-1">R:R</div>
                      <div className="text-sm font-bold font-mono">{setup.rr.toFixed(1)}</div>
                    </div>
                  </div>

                  <div className="mb-2">
                    <AdminLotSizeForCard symbol={setup.symbol} entry={setup.entry} stopLoss={setup.stopLoss} />
                  </div>

                  <p className="text-xs text-muted-light leading-relaxed mb-4">{setup.reason}</p>

                  <div className="grid grid-cols-5 gap-2">
                    {(Object.entries(setup.scoring) as Array<[keyof typeof setup.scoring, number]>).map(([key, val]) => (
                      <div key={key} className="bg-surface-2 rounded-lg p-2 text-center">
                        <div className="text-[9px] text-muted uppercase">{key}</div>
                        <div className={cn(
                          "text-xs font-bold",
                          val >= 0.8 ? "text-bull-light" : val >= 0.6 ? "text-accent-light" : "text-warn",
                        )}>
                          {val.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
