"use client";

import { cn } from "@/lib/utils";

// Liquidity-Mapped Chart Overlay — blueprint § 10.
//
// SVG-based visual showing:
//   • Current price line
//   • Red horizontal lines for each liquidity zone ABOVE current price
//   • Green horizontal lines for each liquidity zone BELOW current price
//   • Path arrows connecting current price → Phase 1 target → Phase 2 target
//     (and Phase 3 if present)
//   • Labels for each zone type + each phase classification
//
// Not a TradingView drawing layer — a focused single-symbol map that
// shows the path geometry at a glance. Sits next to the TradingView
// chart on the per-symbol view, or on each FlowRow in the Snapshots
// tab.

interface PathPhase {
  phase: 1 | 2 | 3;
  classification: "trap" | "real_move" | "continuation" | "reversal";
  direction: "up" | "down";
  fromPrice: number;
  toPrice: number;
  pips: number;
  liquidityLabel: string;
  reasoning: string;
}

interface PathPrediction {
  currentPrice: number;
  phases: PathPhase[];
  finalTarget: number;
  finalDirection: "bullish" | "bearish";
  isTrapScenario: boolean;
  trapType: "bull_trap" | "bear_trap" | "neutral";
  pathConfidence: number;
  distanceAbovePips: number | null;
  distanceBelowPips: number | null;
  nearestAbove: number | null;
  nearestBelow: number | null;
  zonesAbove: number;
  zonesBelow: number;
}

interface Zone {
  zoneType: string;
  direction: string | null;
  priceLow: number;
  priceHigh: number;
  strengthScore: number;
}

export function LiquidityPathOverlay({
  path, zones, decimals, height = 280,
}: {
  path: PathPrediction | null;
  zones: Zone[];
  decimals: number;
  height?: number;
}) {
  if (!path || path.phases.length === 0) {
    return (
      <div className="glass-card border border-border/40 p-4 text-center">
        <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Liquidity Path</div>
        <div className="text-[12px] text-muted-light">No clear path predicted yet — waiting for the next 2-min scan.</div>
      </div>
    );
  }

  // Build the price scale. Include current price + every phase price +
  // every zone reference to find the y-axis bounds.
  const allPrices: number[] = [
    path.currentPrice,
    ...path.phases.flatMap((p) => [p.fromPrice, p.toPrice]),
    ...zones.map((z) => (z.priceLow + z.priceHigh) / 2),
  ];
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const pad = (maxP - minP) * 0.08 || 0.0001;
  const lo = minP - pad;
  const hi = maxP + pad;
  const range = hi - lo;
  const width = 600;
  const margin = { top: 24, right: 110, bottom: 24, left: 12 };
  const plotH = height - margin.top - margin.bottom;
  const plotW = width - margin.left - margin.right;

  const yFromPrice = (price: number) => margin.top + ((hi - price) / range) * plotH;

  // X positions for the path nodes. Current = leftmost, then phase 1, 2, 3
  // distributed across the plot width.
  const numNodes = 1 + path.phases.length;
  const xStep = plotW / Math.max(numNodes, 2);
  const xAt = (i: number) => margin.left + 30 + xStep * i;

  // Sort zones for label layout.
  const above = zones.filter((z) => (z.priceLow + z.priceHigh) / 2 > path.currentPrice)
    .sort((a, b) => a.priceLow - b.priceLow);
  const below = zones.filter((z) => (z.priceLow + z.priceHigh) / 2 < path.currentPrice)
    .sort((a, b) => b.priceLow - a.priceLow);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted">Liquidity Path</div>
        <div className="flex items-center gap-2 text-[10px]">
          {path.isTrapScenario && (
            <span className={cn(
              "px-2 py-0.5 rounded font-bold uppercase",
              path.trapType === "bull_trap" ? "bg-bear/15 text-bear-light" : "bg-bull/15 text-bull-light",
            )}>
              {path.trapType.replace(/_/g, " ")}
            </span>
          )}
          <span className={cn(
            "px-2 py-0.5 rounded uppercase font-bold",
            path.finalDirection === "bullish" ? "bg-bull/15 text-bull-light" : "bg-bear/15 text-bear-light",
          )}>
            Final: {path.finalDirection}
          </span>
          <span className="text-muted-light">conf {path.pathConfidence}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
        {/* Above-price liquidity lines (red) */}
        {above.slice(0, 5).map((z, i) => {
          const ref = (z.priceLow + z.priceHigh) / 2;
          const y = yFromPrice(ref);
          return (
            <g key={`above-${i}`}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y}
                stroke="rgba(239,68,68,0.55)" strokeWidth={1} strokeDasharray="4 3" />
              <text x={width - margin.right + 6} y={y + 3} fill="rgb(252,165,165)"
                fontSize={9} fontFamily="monospace">
                {z.zoneType.replace(/_/g, " ")}
              </text>
              <text x={width - margin.right + 6} y={y + 13} fill="rgb(252,165,165)"
                fontSize={9} fontFamily="monospace" opacity={0.7}>
                {ref.toFixed(decimals)}
              </text>
            </g>
          );
        })}

        {/* Below-price liquidity lines (green) */}
        {below.slice(0, 5).map((z, i) => {
          const ref = (z.priceLow + z.priceHigh) / 2;
          const y = yFromPrice(ref);
          return (
            <g key={`below-${i}`}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y}
                stroke="rgba(34,197,94,0.55)" strokeWidth={1} strokeDasharray="4 3" />
              <text x={width - margin.right + 6} y={y + 3} fill="rgb(134,239,172)"
                fontSize={9} fontFamily="monospace">
                {z.zoneType.replace(/_/g, " ")}
              </text>
              <text x={width - margin.right + 6} y={y + 13} fill="rgb(134,239,172)"
                fontSize={9} fontFamily="monospace" opacity={0.7}>
                {ref.toFixed(decimals)}
              </text>
            </g>
          );
        })}

        {/* Current price line — solid white-ish */}
        {(() => {
          const y = yFromPrice(path.currentPrice);
          return (
            <g>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y}
                stroke="rgba(221,225,240,0.85)" strokeWidth={1.5} />
              <circle cx={xAt(0)} cy={y} r={4} fill="rgb(221,225,240)" />
              <text x={margin.left + 6} y={y - 6} fill="rgb(221,225,240)"
                fontSize={10} fontFamily="monospace" fontWeight="bold">
                NOW {path.currentPrice.toFixed(decimals)}
              </text>
            </g>
          );
        })()}

        {/* Path arrows + phase markers */}
        {path.phases.map((p, i) => {
          const x1 = xAt(i);
          const x2 = xAt(i + 1);
          const y1 = yFromPrice(p.fromPrice);
          const y2 = yFromPrice(p.toPrice);
          const stroke =
            p.classification === "trap"      ? "rgb(252,211,77)"   // amber for trap
            : p.classification === "real_move" ? "rgb(96,165,250)" // blue for real move
            : p.classification === "continuation" ? "rgb(167,139,250)" // purple for continuation
            : "rgb(167,139,250)";
          const arrowId = `arrow-${i}`;
          return (
            <g key={`phase-${i}`}>
              <defs>
                <marker id={arrowId} viewBox="0 0 10 10" refX={9} refY={5}
                  markerWidth={6} markerHeight={6} orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
                </marker>
              </defs>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={2.5}
                markerEnd={`url(#${arrowId})`} />
              <circle cx={x2} cy={y2} r={5} fill={stroke} />
              <text x={x2} y={y2 - 8} fill={stroke} fontSize={10} fontFamily="monospace"
                fontWeight="bold" textAnchor="middle">
                P{p.phase} {p.classification.replace(/_/g, " ")}
              </text>
              <text x={x2} y={y2 + 16} fill={stroke} fontSize={9} fontFamily="monospace"
                opacity={0.85} textAnchor="middle">
                {p.toPrice.toFixed(decimals)} · {p.pips.toFixed(0)}p
              </text>
            </g>
          );
        })}
      </svg>

      {/* Phase reasoning list */}
      <div className="px-4 pb-3 space-y-1.5">
        {path.phases.map((p) => (
          <div key={p.phase} className="text-[11px] flex items-start gap-2">
            <span className={cn(
              "shrink-0 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold",
              p.classification === "trap" ? "bg-warn/20 text-warn-light"
              : p.classification === "real_move" ? "bg-accent/20 text-accent-light"
              : "bg-muted/20 text-muted-light",
            )}>
              P{p.phase} · {p.classification.replace(/_/g, " ")}
            </span>
            <span className="text-muted-light">{p.reasoning}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
