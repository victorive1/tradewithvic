"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type VolView = "ranking" | "heatmap" | "events";
type VolState = "compressed" | "low" | "healthy" | "expanding" | "breakout_ready" | "spike" | "unstable";

interface VolatilityData {
  symbol: string;
  displayName: string;
  category: string;
  price: number;
  change: number;
  changePct: number;
  range: number;
  rangePct: number;
  state: VolState;
  stateLabel: string;
  atrScore: number; // 0-100 normalized
  usableVol: number; // 0-100 — clean vs messy
  tradeQuality: string;
  session: string;
  explanation: string;
}

const STATE_CONFIG: Record<VolState, { label: string; color: string; badge: string; desc: string }> = {
  compressed: { label: "Compressed", color: "text-accent-light", badge: "bg-accent/10 text-accent-light border-accent/20", desc: "Tight range — breakout potential building" },
  low: { label: "Low", color: "text-muted", badge: "bg-surface-3 text-muted border-border", desc: "Below-average movement — dead zone" },
  healthy: { label: "Healthy", color: "text-bull-light", badge: "bg-bull/10 text-bull-light border-bull/20", desc: "Normal tradeable volatility" },
  expanding: { label: "Expanding", color: "text-warn", badge: "bg-warn/10 text-warn border-warn/20", desc: "Volatility growing — momentum building" },
  breakout_ready: { label: "Breakout Ready", color: "text-accent-light", badge: "bg-accent/10 text-accent-light border-accent/20", desc: "Compression ending — expect expansion" },
  spike: { label: "Spike", color: "text-bear-light", badge: "bg-bear/10 text-bear-light border-bear/20", desc: "Abnormal volatility — news or event driven" },
  unstable: { label: "Unstable", color: "text-bear-light", badge: "bg-bear/10 text-bear-light border-bear/20", desc: "High vol + messy structure — dangerous" },
};

function classifyVolatility(changePct: number, rangePct: number): { state: VolState; atrScore: number; usableVol: number; tradeQuality: string } {
  const absChange = Math.abs(changePct);
  const atrScore = Math.min(100, Math.round(absChange * 40 + rangePct * 30));

  // Usable volatility: high if clean directional, low if messy
  const directional = absChange / Math.max(rangePct, 0.01);
  const usableVol = Math.min(100, Math.round(directional * 60 + (absChange > 0.1 ? 20 : 0)));

  let state: VolState;
  let tradeQuality: string;

  if (rangePct < 0.15 && absChange < 0.05) { state = "compressed"; tradeQuality = "Pre-breakout — wait for expansion"; }
  else if (rangePct < 0.25 && absChange < 0.1) { state = "low"; tradeQuality = "Dead zone — avoid or widen targets"; }
  else if (rangePct < 0.6 && absChange < 0.3) { state = "healthy"; tradeQuality = "Ideal for most strategies"; }
  else if (rangePct < 1.0 && absChange < 0.6) { state = "expanding"; tradeQuality = "Good momentum — ride the move"; }
  else if (rangePct >= 1.0 && directional > 0.5) { state = "spike"; tradeQuality = "Event-driven — use caution"; }
  else if (rangePct >= 0.8 && directional < 0.3) { state = "unstable"; tradeQuality = "Messy — avoid trading"; }
  else { state = "breakout_ready"; tradeQuality = "Compression breaking — potential entry"; }

  return { state, atrScore, usableVol, tradeQuality };
}

function getCurrentSession(): string {
  const utcH = new Date().getUTCHours();
  if (utcH >= 21 || utcH < 6) return "Sydney/Tokyo";
  if (utcH >= 7 && utcH < 12) return "London";
  if (utcH >= 12 && utcH < 16) return "London/NY Overlap";
  if (utcH >= 16 && utcH < 21) return "New York";
  return "Transition";
}

function generateExplanation(d: VolatilityData): string {
  const sc = STATE_CONFIG[d.state];
  if (d.state === "compressed") return `${d.displayName} is in a tight range with only ${d.rangePct.toFixed(2)}% intraday movement. This compression often precedes a breakout. Watch for range expansion during the next active session.`;
  if (d.state === "low") return `${d.displayName} showing below-average volatility at ${d.rangePct.toFixed(2)}% range. Not enough movement for most strategies. Consider waiting for London or NY session for better conditions.`;
  if (d.state === "healthy") return `${d.displayName} is moving at a healthy ${d.rangePct.toFixed(2)}% range with ${Math.abs(d.changePct).toFixed(2)}% directional change. Clean enough for most strategy types. ${d.usableVol >= 60 ? "Directional quality is strong." : "Some noise present."}`;
  if (d.state === "expanding") return `${d.displayName} volatility is expanding with ${d.rangePct.toFixed(2)}% range. Momentum is building ${d.changePct > 0 ? "to the upside" : "to the downside"}. Good environment for trend-following and breakout strategies.`;
  if (d.state === "spike") return `${d.displayName} experiencing a volatility spike at ${d.rangePct.toFixed(2)}% range. This is likely news or event-driven. Spreads may be wider. Use reduced position size or wait for conditions to stabilize.`;
  if (d.state === "unstable") return `${d.displayName} is highly volatile but structurally messy — ${d.rangePct.toFixed(2)}% range but only ${Math.abs(d.changePct).toFixed(2)}% net direction. High risk of whipsaws. Most strategies should avoid this environment.`;
  return `${d.displayName} compression may be resolving. ${d.rangePct.toFixed(2)}% range with building pressure. Watch for a clean break to enter.`;
}

export default function VolatilityScannerPage() {
  const [data, setData] = useState<VolatilityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<VolView>("ranking");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"atr" | "change" | "usable">("atr");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market/quotes");
        const json = await res.json();
        if (json.quotes) {
          const session = getCurrentSession();
          const mapped: VolatilityData[] = json.quotes.map((q: any) => {
            const rangePct = q.price > 0 ? ((q.high - q.low) / q.price) * 100 : 0;
            const vol = classifyVolatility(q.changePercent, rangePct);
            const d: VolatilityData = {
              symbol: q.symbol, displayName: q.displayName, category: q.category,
              price: q.price, change: q.change, changePct: q.changePercent,
              range: q.high - q.low, rangePct, state: vol.state, stateLabel: STATE_CONFIG[vol.state].label,
              atrScore: vol.atrScore, usableVol: vol.usableVol, tradeQuality: vol.tradeQuality,
              session, explanation: "",
            };
            d.explanation = generateExplanation(d);
            return d;
          });
          setData(mapped);
        }
      } catch {}
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  let filtered = data;
  if (stateFilter !== "all") filtered = filtered.filter((d) => d.state === stateFilter);
  if (categoryFilter !== "all") filtered = filtered.filter((d) => d.category === categoryFilter);
  if (sortBy === "atr") filtered = [...filtered].sort((a, b) => b.atrScore - a.atrScore);
  else if (sortBy === "change") filtered = [...filtered].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  else filtered = [...filtered].sort((a, b) => b.usableVol - a.usableVol);

  const stateCounts = Object.fromEntries(Object.keys(STATE_CONFIG).map((s) => [s, data.filter((d) => d.state === s).length]));
  const avgAtr = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.atrScore, 0) / data.length) : 0;
  const topMover = [...data].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Volatility Scanner</h1><p className="text-sm text-muted mt-1">Scanning markets...</p></div>
        <div className="space-y-3">{[1,2,3,4,5].map((i) => <div key={i} className="glass-card p-5 animate-pulse"><div className="h-16 bg-surface-3 rounded" /></div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Volatility Scanner</h1>
        <p className="text-sm text-muted mt-1">Live volatility ranking, state classification, and trade quality assessment across all markets</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{data.length}</div><div className="text-[10px] text-muted">Instruments</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-accent-light">{avgAtr}</div><div className="text-[10px] text-muted">Avg Vol Score</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-warn">{topMover?.displayName || "—"}</div><div className="text-[10px] text-muted">Highest Mover</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bull-light">{stateCounts["healthy"] || 0}</div><div className="text-[10px] text-muted">Healthy</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bear-light">{(stateCounts["spike"] || 0) + (stateCounts["unstable"] || 0)}</div><div className="text-[10px] text-muted">Caution</div></div>
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[{ id: "ranking" as VolView, l: "Ranking" }, { id: "heatmap" as VolView, l: "State Overview" }, { id: "events" as VolView, l: "Explanations" }].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{v.l}</button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        {["all", "forex", "metals", "crypto"].map((c) => (
          <button key={c} onClick={() => setCategoryFilter(c)} className={cn("px-3 py-1.5 rounded-lg text-xs capitalize transition-smooth", categoryFilter === c ? "bg-surface-3 text-foreground border border-border-light" : "text-muted hover:text-muted-light")}>{c === "all" ? "All Markets" : c}</button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        {(Object.entries(STATE_CONFIG) as [VolState, typeof STATE_CONFIG[VolState]][]).slice(0, 4).map(([key, cfg]) => (
          <button key={key} onClick={() => setStateFilter(stateFilter === key ? "all" : key)} className={cn("px-2.5 py-1 rounded-lg text-[10px] transition-smooth border", stateFilter === key ? cfg.badge : "bg-surface-2 text-muted border-border/50")}>
            {cfg.label} ({stateCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>Sort by:</span>
        {[{ id: "atr" as const, l: "Vol Score" }, { id: "change" as const, l: "Price Change" }, { id: "usable" as const, l: "Usable Vol" }].map((s) => (
          <button key={s.id} onClick={() => setSortBy(s.id)} className={cn("px-2 py-1 rounded transition-smooth", sortBy === s.id ? "bg-accent/20 text-accent-light" : "hover:text-muted-light")}>{s.l}</button>
        ))}
      </div>

      {/* RANKING VIEW */}
      {view === "ranking" && (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-border/50">
              <th className="text-left text-[10px] text-muted font-medium px-4 py-3">Instrument</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Price</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Change</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Range %</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Vol Score</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Usable</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">State</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Trade Quality</th>
            </tr></thead>
            <tbody>
              {filtered.map((d) => {
                const sc = STATE_CONFIG[d.state];
                return (
                  <tr key={d.symbol} className="border-b border-border/20 hover:bg-surface-2/50 transition-smooth">
                    <td className="px-4 py-3"><div className="text-xs font-semibold">{d.displayName}</div><div className="text-[10px] text-muted capitalize">{d.category}</div></td>
                    <td className="px-3 py-3 text-xs font-mono">{d.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-3"><span className={cn("text-xs font-medium", d.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>{d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%</span></td>
                    <td className="px-3 py-3 text-xs font-mono">{d.rangePct.toFixed(2)}%</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-10 h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className={cn("h-full rounded-full", d.atrScore >= 60 ? "bg-warn" : d.atrScore >= 30 ? "bg-accent" : "bg-muted")} style={{ width: `${d.atrScore}%` }} /></div>
                        <span className="text-[10px] font-mono">{d.atrScore}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-10 h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className={cn("h-full rounded-full", d.usableVol >= 60 ? "bg-bull" : d.usableVol >= 35 ? "bg-accent" : "bg-muted")} style={{ width: `${d.usableVol}%` }} /></div>
                        <span className="text-[10px] font-mono">{d.usableVol}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", sc.badge)}>{sc.label}</span></td>
                    <td className="px-3 py-3 text-[10px] text-muted-light max-w-[180px]">{d.tradeQuality}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* STATE OVERVIEW / HEATMAP */}
      {view === "heatmap" && (
        <div className="space-y-4">
          {(Object.entries(STATE_CONFIG) as [VolState, typeof STATE_CONFIG[VolState]][]).map(([state, cfg]) => {
            const items = filtered.filter((d) => d.state === state);
            if (items.length === 0) return null;
            return (
              <div key={state} className="glass-card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border", cfg.badge)}>{cfg.label}</span>
                  <span className="text-xs text-muted">{cfg.desc}</span>
                  <span className="text-xs text-foreground font-bold ml-auto">{items.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((d) => (
                    <div key={d.symbol} className="bg-surface-2 rounded-xl px-3 py-2 border border-border/30 min-w-[120px]">
                      <div className="text-xs font-semibold">{d.displayName}</div>
                      <div className={cn("text-[10px] font-mono", d.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>{d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%</div>
                      <div className="text-[10px] text-muted">Vol: {d.atrScore} • Use: {d.usableVol}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* EXPLANATIONS VIEW */}
      {view === "events" && (
        <div className="space-y-3">
          {filtered.map((d) => {
            const sc = STATE_CONFIG[d.state];
            return (
              <div key={d.symbol} className={cn("glass-card p-5 border-l-4", d.state === "healthy" || d.state === "expanding" ? "border-l-bull" : d.state === "spike" || d.state === "unstable" ? "border-l-bear" : d.state === "compressed" || d.state === "breakout_ready" ? "border-l-accent" : "border-l-border")}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{d.displayName}</span>
                    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", sc.badge)}>{sc.label}</span>
                    <span className={cn("text-xs font-mono", d.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>{d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted">Vol: <span className="text-foreground font-bold">{d.atrScore}</span></span>
                    <span className="text-muted">Usable: <span className={cn("font-bold", d.usableVol >= 60 ? "text-bull-light" : d.usableVol >= 35 ? "text-accent-light" : "text-muted")}>{d.usableVol}</span></span>
                  </div>
                </div>
                <p className="text-xs text-muted-light leading-relaxed mb-2">{d.explanation}</p>
                <div className="text-[10px] text-muted">Quality: <span className="text-foreground">{d.tradeQuality}</span> • Session: <span className="text-foreground">{d.session}</span></div>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How the Volatility Scanner Works</h3>
        <div className="grid sm:grid-cols-3 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Two Volatility Metrics</p>
            <p><strong>Vol Score</strong> measures raw movement intensity (ATR + range). <strong>Usable Vol</strong> measures how clean and directional the movement is. A market can have high vol but low usable vol if it&apos;s whipsawing.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">7 State Classifications</p>
            <p>Compressed (pre-breakout), Low (dead zone), Healthy (tradeable), Expanding (momentum), Breakout Ready, Spike (event), Unstable (messy). Each state maps to specific strategy recommendations.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Trade Quality Assessment</p>
            <p>Every instrument gets a plain-English trade quality note. Breakout strategies should look for &ldquo;Expanding&rdquo; or &ldquo;Breakout Ready.&rdquo; Scalpers should avoid &ldquo;Low&rdquo; and &ldquo;Unstable.&rdquo;</p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">State Legend</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.entries(STATE_CONFIG) as [VolState, typeof STATE_CONFIG[VolState]][]).map(([, cfg]) => (
            <div key={cfg.label} className="flex items-center gap-2">
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", cfg.badge)}>{cfg.label}</span>
              <span className="text-[10px] text-muted">{cfg.desc.split("—")[0]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
