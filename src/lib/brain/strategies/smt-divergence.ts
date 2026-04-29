// PDF Strategy 05 — SMT Divergence (Smart Money Technique).
//
// Two correlated instruments fail to confirm each other's price extreme.
// One sweeps liquidity, the other diverges. The non-confirming pair is
// the leading signal of institutional manipulation.
//
// Correlation pairs from PDF (positive = same-direction, negative = inverse):
//   EURUSD ↔ GBPUSD          positive
//   EURUSD ↔ USDCHF          negative (inverse)
//   AUDUSD ↔ NZDUSD          positive
//   USDJPY ↔ EURJPY ↔ GBPJPY positive (yen crosses)
//   XAUUSD ↔ DXY             negative
//   US30  ↔ NAS100 ↔ SPX500  positive (indices)
//
// Bullish SMT: primary makes a new low while correlated pair fails to
// confirm (does NOT make a new low). Reversal expected on the failing
// pair.

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { scoreEps, killzone, loadCandles, loadStructure, type CandleRow, type GateOutcome } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastEventType?: string | null } | null;
  indicators: { atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepDirection?: string; sweepHigh?: number; sweepLow?: number; levelType?: string; levelPrice?: number }>;
  activeLevels: Array<{ levelType: string; price: number }>;
  atr: number | null;
}

// Correlation map: for each symbol, list its correlated peer + sign.
// sign = +1 (positive correlation), -1 (inverse correlation).
// SMT triggers on disagreement: bullish SMT = positive pair fails to
// confirm a new low; for inverse pair, bullish SMT = inverse pair
// fails to confirm a new HIGH (since they should mirror).
const PEERS: Record<string, Array<{ symbol: string; sign: 1 | -1 }>> = {
  EURUSD: [{ symbol: "GBPUSD", sign: 1 }, { symbol: "USDCHF", sign: -1 }],
  GBPUSD: [{ symbol: "EURUSD", sign: 1 }],
  USDCHF: [{ symbol: "EURUSD", sign: -1 }],
  AUDUSD: [{ symbol: "NZDUSD", sign: 1 }],
  NZDUSD: [{ symbol: "AUDUSD", sign: 1 }],
  USDJPY: [{ symbol: "EURJPY", sign: 1 }, { symbol: "GBPJPY", sign: 1 }],
  EURJPY: [{ symbol: "USDJPY", sign: 1 }, { symbol: "GBPJPY", sign: 1 }],
  GBPJPY: [{ symbol: "USDJPY", sign: 1 }, { symbol: "EURJPY", sign: 1 }],
  US30:   [{ symbol: "NAS100", sign: 1 }, { symbol: "SPX500", sign: 1 }],
  NAS100: [{ symbol: "US30",   sign: 1 }, { symbol: "SPX500", sign: 1 }],
  SPX500: [{ symbol: "US30",   sign: 1 }, { symbol: "NAS100", sign: 1 }],
  // XAUUSD vs DXY skipped — DXY isn't reliably present in the brain.
};

const LOOKBACK_BARS = 25;

export async function detectSmtDivergence(ctx: StrategyContext): Promise<DetectedSetup | null> {
  // Run on 15m — PDF: divergence + CHoCH on M15.
  if (ctx.timeframe !== "15m") return null;
  if (ctx.candles.length < LOOKBACK_BARS || !ctx.atr) return null;

  const peers = PEERS[ctx.symbol.toUpperCase()];
  if (!peers || peers.length === 0) return null;

  // For each peer, fetch the same window and compute prior-window vs
  // recent-window extremes. SMT bullish: primary makes new low, peer
  // doesn't (positive corr) OR peer makes lower high (inverse corr).
  for (const peer of peers) {
    const peerCandles = await loadCandles(peer.symbol, "15m", LOOKBACK_BARS);
    if (peerCandles.length < LOOKBACK_BARS) continue;

    const halfPrimary = ctx.candles.slice(-LOOKBACK_BARS, -Math.floor(LOOKBACK_BARS / 2));
    const recentPrimary = ctx.candles.slice(-Math.floor(LOOKBACK_BARS / 2));
    const halfPeer = peerCandles.slice(0, peerCandles.length - Math.floor(LOOKBACK_BARS / 2));
    const recentPeer = peerCandles.slice(peerCandles.length - Math.floor(LOOKBACK_BARS / 2));

    const primPrevLow = Math.min(...halfPrimary.map((c) => c.low));
    const primRecentLow = Math.min(...recentPrimary.map((c) => c.low));
    const primPrevHigh = Math.max(...halfPrimary.map((c) => c.high));
    const primRecentHigh = Math.max(...recentPrimary.map((c) => c.high));

    const peerPrevLow = Math.min(...halfPeer.map((c) => c.low));
    const peerRecentLow = Math.min(...recentPeer.map((c) => c.low));
    const peerPrevHigh = Math.max(...halfPeer.map((c) => c.high));
    const peerRecentHigh = Math.max(...recentPeer.map((c) => c.high));

    let direction: "bullish" | "bearish" | null = null;
    let evidence = "";

    if (peer.sign === 1) {
      // Bullish SMT: primary made new low (recent < prev) but peer didn't.
      if (primRecentLow < primPrevLow && peerRecentLow > peerPrevLow) {
        direction = "bullish";
        evidence = `${ctx.symbol} new low ${primRecentLow.toFixed(5)} < prior ${primPrevLow.toFixed(5)}; ${peer.symbol} held above ${peerPrevLow.toFixed(5)}`;
      } else if (primRecentHigh > primPrevHigh && peerRecentHigh < peerPrevHigh) {
        direction = "bearish";
        evidence = `${ctx.symbol} new high ${primRecentHigh.toFixed(5)} > prior ${primPrevHigh.toFixed(5)}; ${peer.symbol} failed to confirm`;
      }
    } else {
      // Inverse correlation. Pairs should mirror — primary new low while
      // peer makes new low too = SMT (because peer should have made new high).
      if (primRecentLow < primPrevLow && peerRecentLow < peerPrevLow) {
        direction = "bullish";
        evidence = `${ctx.symbol} new low + inverse peer ${peer.symbol} also new low (should have made new high) = bullish SMT`;
      } else if (primRecentHigh > primPrevHigh && peerRecentHigh > peerPrevHigh) {
        direction = "bearish";
        evidence = `${ctx.symbol} new high + inverse peer ${peer.symbol} also new high = bearish SMT`;
      }
    }

    if (!direction) continue;

    // Confirm: at least one side shows CHoCH on M15.
    const primStructure = ctx.structure;
    const peerStructure = await loadStructure(peer.symbol, "15m");
    const expectedChoch = direction === "bullish" ? "choch_bullish" : "choch_bearish";
    const chochSomewhere = primStructure?.lastEventType === expectedChoch || peerStructure?.lastEventType === expectedChoch;
    if (!chochSomewhere) continue;

    // Killzone gate — PDF: "Asian session SMT = very low conviction".
    const kz = killzone();
    if (kz.score === 0) continue; // off-session SMT suppressed per PDF

    // ── Levels ────────────────────────────────────────────────────────────
    // Entry on primary pair (the one that made the new extreme).
    const last = ctx.candles[ctx.candles.length - 1];
    const entry = last.close;
    const buffer = ctx.atr * 0.3;
    const stopLoss = direction === "bullish"
      ? primRecentLow - buffer
      : primRecentHigh + buffer;
    const risk = Math.abs(entry - stopLoss);
    if (risk <= 0) continue;
    const tp1 = direction === "bullish"
      ? primPrevHigh
      : primPrevLow;
    const rr = Math.abs(tp1 - entry) / risk;
    if (rr < 2) continue;
    const tp2 = direction === "bullish" ? entry + risk * 4 : entry - risk * 4;

    // ── EPS factors ──────────────────────────────────────────────────────
    const lq = 88; // SMT at a swept extreme of the primary pair
    const loc = 80; // tied to a defined extreme; can't directly check OB without more data
    const mom = chochSomewhere ? 88 : 65;
    const vol = 70; // can't reliably compare cross-pair volume here
    const eps = scoreEps({ lq, loc, mom, vol, time: kz.score });
    if (eps.tier === "SUPPRESSED") continue;

    const gates: GateOutcome[] = [
      { id: "smt",     label: `${peer.sign === 1 ? "Positive" : "Inverse"} pair divergence vs ${peer.symbol}`, passed: true, evidence },
      { id: "choch",   label: "CHoCH on M15 (primary or peer)",                         passed: chochSomewhere, evidence: `primary lastEvent=${primStructure?.lastEventType ?? "—"}, peer=${peerStructure?.lastEventType ?? "—"}` },
      { id: "killzone",label: "Active killzone (Asian SMT excluded per PDF)",           passed: kz.score === 100, evidence: kz.name },
      { id: "rr",      label: "≥2:1 RR available",                                       passed: rr >= 2, evidence: `${rr.toFixed(2)}R` },
    ];

    return {
      setupType: "smt_divergence",
      direction,
      entry,
      stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      riskReward: rr,
      confidenceScore: eps.score,
      qualityGrade: eps.qualityGrade,
      explanation: `SMT — ${ctx.symbol} vs ${peer.symbol} (${peer.sign === 1 ? "positive" : "inverse"} corr). ${evidence}. CHoCH confirms structural shift. EPS ${eps.score}/100 (${eps.tier}). Entry ${entry.toFixed(5)}, SL beyond extreme ${stopLoss.toFixed(5)}, TP1 = prior opposing extreme ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`,
      invalidation: `Failing pair eventually confirms the new extreme — divergence resolved.`,
      validHours: 6,
      metadata: { strategy: "smt_divergence", tier: eps.tier, eps: eps.score, factors: eps.factors, peer: peer.symbol, peerSign: peer.sign, gates },
    };
  }

  return null;
}
