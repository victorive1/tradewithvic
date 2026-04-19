"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ADMIN_TOKEN_KEY = "tradewithvic.brain.adminToken";

type Status = "healthy" | "degraded" | "down";

interface CheckResult {
  status: Status;
  message: string;
  detail?: any;
}

interface SymbolHealth {
  symbol: string;
  status: Status;
  lastFlowAt: string | null;
  lastFlowAgeMs: number | null;
  candleFreshnessMs: number | null;
  activeSignals: number;
  notes: string[];
}

interface HealthPayload {
  status: Status;
  checkedAt: string;
  elapsedMs: number;
  checks: {
    engineCadence: CheckResult;
    activeSignals: CheckResult;
    symbolCoverage: CheckResult;
    upstream: CheckResult[];
  };
  perSymbol: SymbolHealth[];
}

function msToReadable(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function statusToneClasses(s: Status): string {
  if (s === "healthy") return "bg-bull/10 border-bull/40 text-bull-light";
  if (s === "degraded") return "bg-warn/10 border-warn/40 text-warn";
  return "bg-bear/10 border-bear/40 text-bear-light";
}

function statusDotBg(s: Status): string {
  if (s === "healthy") return "bg-bull";
  if (s === "degraded") return "bg-warn";
  return "bg-bear";
}

function statusLabel(s: Status): string {
  return s === "healthy" ? "Healthy" : s === "degraded" ? "Degraded" : "Down";
}

export default function InstitutionalFlowHealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<Array<{ at: number; action: string; message: string; ok: boolean }>>([]);
  const [adminToken, setAdminToken] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/iflow/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`health_${res.status}`);
      setData(await res.json());
    } catch (e: any) { setError(e.message ?? "Failed to load health"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    try { setAdminToken(window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? ""); } catch {}
    load();
    const int = setInterval(load, 30_000);
    return () => clearInterval(int);
  }, [load]);

  function saveToken(t: string) {
    setAdminToken(t);
    try { window.localStorage.setItem(ADMIN_TOKEN_KEY, t); } catch {}
  }

  async function doAction(action: string, label: string, confirmMsg?: string) {
    if (!adminToken) {
      setActionLog((l) => [{ at: Date.now(), action, message: "Admin token required (enter it at the top).", ok: false }, ...l].slice(0, 8));
      return;
    }
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActing(action);
    try {
      const res = await fetch("/api/iflow/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      const msg = buildActionMessage(action, body, res.ok);
      setActionLog((l) => [{ at: Date.now(), action: label, message: msg, ok: res.ok }, ...l].slice(0, 8));
      await load();
    } catch (e: any) {
      setActionLog((l) => [{ at: Date.now(), action: label, message: e.message ?? "request_failed", ok: false }, ...l].slice(0, 8));
    } finally { setActing(null); }
  }

  const overall: Status | "unknown" = data?.status ?? "unknown";

  return (
    <div className="page-container space-y-5 max-w-5xl">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/institutional-flow" className="text-xs text-muted hover:text-foreground">← Institutional Flow</Link>
          <h1 className="text-fluid-3xl font-bold mt-1">Engine Health</h1>
          <p className="text-fluid-sm text-muted-light mt-1">
            Live status of the Institutional Flow Intelligence engine plus one-tap repair actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <div className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider",
              statusToneClasses(data.status))}>
              <span className={cn("w-2 h-2 rounded-full pulse-live", statusDotBg(data.status))} />
              {statusLabel(data.status)}
            </div>
          )}
          <button onClick={load} className="btn-ghost text-xs">↻ Recheck</button>
        </div>
      </header>

      <section className="glass-card p-4 border border-border/50">
        <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted block mb-1.5">Admin token</label>
        <div className="flex gap-2">
          <input
            type="password"
            value={adminToken}
            onChange={(e) => saveToken(e.target.value)}
            placeholder="ADMIN_REFRESH_SECRET (stored locally only)"
            className="input flex-1 font-mono text-xs"
          />
          {adminToken && (
            <span className="self-center text-[11px] text-bull-light">saved</span>
          )}
        </div>
        <p className="text-[10px] text-muted mt-1.5">
          Required for repair actions. Same token that gates /api/brain/refresh.
        </p>
      </section>

      {error && <div className="glass-card p-4 border border-bear/40 text-sm text-bear-light">{error}</div>}
      {!data && loading && <div className="glass-card p-10 text-center text-muted">Running diagnostics…</div>}

      {data && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CheckCard title="Engine cadence" check={data.checks.engineCadence} />
            <CheckCard title="Active signals" check={data.checks.activeSignals} />
            <CheckCard title="Symbol coverage" check={data.checks.symbolCoverage} />
            <UpstreamCard checks={data.checks.upstream} />
          </section>

          <section className="glass-card p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Repair actions</h2>
              {overall !== "healthy" && (
                <span className="text-[11px] text-warn">Engine is {overall}. Try the actions in order.</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <RepairButton
                label="Force refresh"
                hint="Re-runs the scoring pipeline across all watched symbols now."
                busy={acting === "refresh"}
                onClick={() => doAction("refresh", "Force refresh")}
              />
              <RepairButton
                label="Rerun brain scan"
                hint="Full brain scan (quotes → candles → structure → iflow). Fixes most stalled states."
                busy={acting === "rerun_brain_scan"}
                onClick={() => doAction("rerun_brain_scan", "Rerun brain scan")}
              />
              <RepairButton
                label="Invalidate stuck signals"
                hint="Marks active signals older than 2h as invalid. Safe to run anytime."
                busy={acting === "invalidate_stuck"}
                onClick={() => doAction("invalidate_stuck", "Invalidate stuck")}
              />
              <RepairButton
                label="Purge old flow events"
                hint="Deletes FlowEvent rows older than 7 days. Keeps tables lean."
                busy={acting === "purge_stale_flow"}
                onClick={() => doAction("purge_stale_flow", "Purge stale flow", "Delete FlowEvent rows older than 7 days?")}
              />
              <RepairButton
                label="Full reset (all signals)"
                hint="⚠ Invalidates EVERY active signal. Only use if the board shows bad data."
                busy={acting === "invalidate_all"}
                danger
                onClick={() => doAction("invalidate_all", "Full reset", "This invalidates EVERY active signal and starts fresh on the next cycle. Continue?")}
              />
            </div>

            {actionLog.length > 0 && (
              <div className="border-t border-border/40 pt-3 mt-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Recent actions</div>
                {actionLog.map((entry, i) => (
                  <div key={i} className={cn("flex items-center gap-2 text-xs p-2 rounded-lg border",
                    entry.ok ? "border-bull/30 bg-bull/5" : "border-bear/30 bg-bear/5")}>
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider w-24 shrink-0",
                      entry.ok ? "text-bull-light" : "text-bear-light")}>
                      {entry.ok ? "✓ Done" : "✕ Failed"}
                    </span>
                    <span className="font-semibold">{entry.action}</span>
                    <span className="text-muted-light truncate">· {entry.message}</span>
                    <span className="ml-auto text-[10px] text-muted font-mono shrink-0">{new Date(entry.at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass-card p-4 sm:p-5 space-y-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Per-symbol coverage</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-border/40">
                    <th className="text-left py-2 pr-3">SYMBOL</th>
                    <th className="text-left px-2">STATUS</th>
                    <th className="text-right px-2">LAST FLOW</th>
                    <th className="text-right px-2">CANDLES</th>
                    <th className="text-right px-2">ACTIVE SIGNALS</th>
                    <th className="text-left px-2">NOTES</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perSymbol.map((s) => (
                    <tr key={s.symbol} className="border-b border-border/20 last:border-0">
                      <td className="py-2 pr-3 font-mono font-semibold">{s.symbol}</td>
                      <td className="px-2">
                        <span className={cn("inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider",
                          statusToneClasses(s.status))}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", statusDotBg(s.status))} />
                          {statusLabel(s.status)}
                        </span>
                      </td>
                      <td className="text-right px-2 font-mono text-muted-light">{msToReadable(s.lastFlowAgeMs)} ago</td>
                      <td className="text-right px-2 font-mono text-muted-light">{msToReadable(s.candleFreshnessMs)} ago</td>
                      <td className={cn("text-right px-2 font-mono", s.activeSignals > 0 ? "text-accent-light" : "text-muted")}>
                        {s.activeSignals}
                      </td>
                      <td className="px-2 text-muted text-[11px]">{s.notes.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted">
              Checked at {new Date(data.checkedAt).toLocaleString()} · {data.elapsedMs}ms. Page auto-refreshes every 30s.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function CheckCard({ title, check }: { title: string; check: CheckResult }) {
  return (
    <div className={cn("rounded-xl border p-4 transition-smooth", statusToneClasses(check.status))}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{title}</span>
        <span className={cn("w-2 h-2 rounded-full", statusDotBg(check.status))} />
      </div>
      <div className="text-[13px] text-foreground leading-relaxed">{check.message}</div>
    </div>
  );
}

function UpstreamCard({ checks }: { checks: CheckResult[] }) {
  const worst: Status = checks.some((c) => c.status === "down") ? "down"
    : checks.some((c) => c.status === "degraded") ? "degraded" : "healthy";
  return (
    <div className={cn("rounded-xl border p-4", statusToneClasses(worst))}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Upstream dependencies</span>
        <span className={cn("w-2 h-2 rounded-full", statusDotBg(worst))} />
      </div>
      <ul className="space-y-1.5 text-[12px]">
        {checks.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", statusDotBg(c.status))} />
            <span className="text-foreground">{c.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RepairButton({
  label, hint, busy, onClick, danger,
}: {
  label: string;
  hint: string;
  busy: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        "text-left p-3 rounded-xl border transition-smooth disabled:opacity-50",
        danger
          ? "border-bear/40 bg-bear/5 hover:bg-bear/10"
          : "border-border bg-surface-2/50 hover:border-accent/40 hover:bg-accent/5",
      )}
    >
      <div className={cn("text-sm font-bold mb-1", danger ? "text-bear-light" : "text-foreground")}>
        {busy ? "Running…" : label}
      </div>
      <div className="text-[11px] text-muted">{hint}</div>
    </button>
  );
}

function buildActionMessage(action: string, body: any, ok: boolean): string {
  if (!ok) return body?.error ?? body?.message ?? "Action failed";
  switch (action) {
    case "refresh": return `Scored ${body.scanned} symbols, produced ${body.signalsCreated} signals, invalidated ${body.invalidated} stale (${body.elapsedMs}ms)`;
    case "rerun_brain_scan": return `Scan ${body.scan?.status ?? "ran"} — ${body.scan?.setupsGenerated ?? 0} setups, ${body.scan?.errorCount ?? 0} errors`;
    case "invalidate_stuck": return `Invalidated ${body.invalidated} stuck signals`;
    case "invalidate_all": return `Invalidated ${body.invalidated} active signals — next cycle rebuilds the board`;
    case "purge_stale_flow": return `Deleted ${body.deleted} FlowEvent rows`;
    default: return "Action completed";
  }
}
