"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const USERKEY_STORAGE = "tradewithvic_billing_user_key";
const MT_ACCOUNTS_KEY = "mt_accounts";

function getOrCreateUserKey(): string {
  if (typeof window === "undefined") return "";
  let k = window.localStorage.getItem(USERKEY_STORAGE);
  if (!k) {
    k = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `uk_${Date.now()}`;
    window.localStorage.setItem(USERKEY_STORAGE, k);
  }
  return k;
}

function readLocalMtAccounts() {
  try {
    const raw = window.localStorage.getItem(MT_ACCOUNTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/**
 * Setup shape accepted by the Execute Trade button. Every setup surface in
 * the app (Trade Setups, Editors Pick, Order Block Signals, Breakouts, etc.)
 * can map into this. Nothing here is required except symbol + direction.
 */
export interface SetupForExecution {
  symbol: string;                 // canonical internal symbol (EURUSD, BTCUSD, …)
  direction: "buy" | "sell" | "bullish" | "bearish" | string;
  entry?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  timeframe?: string | null;
  setupType?: string | null;      // e.g. "breakout", "liquidity_sweep"
  qualityGrade?: string | null;
  confidenceScore?: number | null;
  sourceType?: string;            // "setup" | "editors_pick" | "order_block" | …
  sourceRef?: string;             // id of the setup/signal
}

interface LinkedAccount {
  id: string;
  platformType: "MT4" | "MT5";
  brokerName: string;
  accountLogin: string;
  accountLabel: string | null;
  connectionStatus: string;
}

function normalizeSide(d: string): "buy" | "sell" {
  const s = d.toLowerCase();
  if (s === "buy" || s === "bullish" || s === "long") return "buy";
  return "sell";
}

export function ExecuteTradeButton({
  setup,
  size = "sm",
  variant = "primary",
  className,
}: {
  setup: SetupForExecution;
  size?: "sm" | "md";
  variant?: "primary" | "inline";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const side = normalizeSide(setup.direction);

  if (variant === "inline") {
    return (
      <>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-semibold transition-smooth",
            side === "buy" ? "text-bull-light hover:text-bull" : "text-bear-light hover:text-bear",
            className,
          )}
        >
          <span>⚡</span> Execute trade
        </button>
        {open && <ExecuteTradeModal setup={setup} onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          "group relative inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-white overflow-hidden transition-smooth",
          size === "sm" ? "px-3.5 py-2 text-[12px]" : "px-5 py-2.5 text-[13px]",
          className,
        )}
        style={{
          background: side === "buy"
            ? "linear-gradient(135deg, #10b981, #059669)"
            : "linear-gradient(135deg, #f43f5e, #be123c)",
          boxShadow: side === "buy"
            ? "0 6px 24px rgba(16,185,129,0.35), inset 0 1px 0 rgba(255,255,255,0.22)"
            : "0 6px 24px rgba(244,63,94,0.35), inset 0 1px 0 rgba(255,255,255,0.22)",
        }}
      >
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
        <span className="relative">⚡</span>
        <span className="relative">Execute {side.toUpperCase()}</span>
      </button>
      {open && <ExecuteTradeModal setup={setup} onClose={() => setOpen(false)} />}
    </>
  );
}

function ExecuteTradeModal({ setup, onClose }: { setup: SetupForExecution; onClose: () => void }) {
  const [userKey, setUserKey] = useState("");
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState("");

  const side = normalizeSide(setup.direction);

  const [sizingMode, setSizingMode] = useState<"fixed_lots" | "risk_percent">("fixed_lots");
  const [volume, setVolume] = useState("0.10");
  const [riskPct, setRiskPct] = useState("1.0");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [resultStage, setResultStage] = useState<"form" | "confirm" | "done">("form");
  const [result, setResult] = useState<any>(null);

  const headers = useMemo(
    () => ({ "Content-Type": "application/json", "x-trading-user-key": userKey, "x-billing-user-key": userKey }),
    [userKey],
  );

  useEffect(() => { setUserKey(getOrCreateUserKey()); }, []);

  // Lock body scroll + ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Load accounts (and auto-migrate localStorage MT accounts into backend)
  const loadAccounts = useCallback(async () => {
    if (!userKey) return;
    setLoading(true);
    try {
      const local = readLocalMtAccounts();
      for (const a of local) {
        await fetch("/api/trading/accounts", {
          method: "POST", headers,
          body: JSON.stringify({
            platformType: a.platform, brokerName: a.broker,
            serverName: a.server, accountLogin: a.login, accountLabel: a.label ?? null,
          }),
        }).catch(() => {});
      }
      const res = await fetch("/api/trading/accounts", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);
        if (data.accounts?.[0]?.id) setAccountId(data.accounts[0].id);
      }
    } finally { setLoading(false); }
  }, [userKey, headers]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  async function runValidateAndConfirm() {
    setError(null); setWarnings([]);
    setSubmitting(true);
    try {
      const res = await fetch("/api/trading/validate", {
        method: "POST", headers,
        body: JSON.stringify({
          accountId,
          internalSymbol: setup.symbol,
          side,
          orderType: "market",
          requestedVolume: Number(volume),
          sizingMode,
          riskPercent: sizingMode === "risk_percent" ? Number(riskPct) : undefined,
          stopLoss: setup.stopLoss ?? null,
          takeProfit: setup.takeProfit ?? null,
          currentPrice: setup.entry ?? null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "validation_failed");
        return;
      }
      setWarnings(data.warnings ?? []);
      setResultStage("confirm");
    } finally { setSubmitting(false); }
  }

  async function submitOrder() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/trading/execute", {
        method: "POST", headers,
        body: JSON.stringify({
          accountId,
          internalSymbol: setup.symbol,
          side,
          orderType: "market",
          requestedVolume: Number(volume),
          sizingMode,
          riskPercent: sizingMode === "risk_percent" ? Number(riskPct) : null,
          stopLoss: setup.stopLoss ?? null,
          takeProfit: setup.takeProfit ?? null,
          currentPrice: setup.entry ?? null,
          sourceType: setup.sourceType ?? "setup",
          sourceRef: setup.sourceRef ?? null,
          comment: setup.setupType ? `${setup.setupType}${setup.timeframe ? ` · ${setup.timeframe}` : ""}` : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "execute_failed");
        return;
      }
      setResult(data);
      setResultStage("done");
    } finally { setSubmitting(false); }
  }

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const rr = (() => {
    if (!setup.entry || !setup.stopLoss || !setup.takeProfit) return null;
    const risk = Math.abs(setup.entry - setup.stopLoss);
    const reward = Math.abs(setup.takeProfit - setup.entry);
    if (risk <= 0) return null;
    return reward / risk;
  })();

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface border border-border/60 sm:rounded-2xl rounded-t-3xl shadow-[0_30px_80px_rgba(0,0,0,0.5)] max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className={cn("p-4 sm:p-5 border-b border-border/60 relative overflow-hidden shrink-0")}>
          <div
            aria-hidden
            className="absolute inset-0 opacity-60 pointer-events-none"
            style={{
              background: side === "buy"
                ? "radial-gradient(circle at 50% 0%, rgba(16,185,129,0.22), transparent 60%)"
                : "radial-gradient(circle at 50% 0%, rgba(244,63,94,0.22), transparent 60%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Execute Trade</span>
                {setup.timeframe && <span className="text-[10px] text-muted">· {setup.timeframe}</span>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded-md font-bold text-[11px] border",
                  side === "buy"
                    ? "border-bull/40 text-bull-light bg-bull/10"
                    : "border-bear/40 text-bear-light bg-bear/10"
                )}>
                  {side === "buy" ? "▲ BUY" : "▼ SELL"}
                </span>
                <span className="font-mono font-bold text-base sm:text-lg">{setup.symbol}</span>
                {setup.qualityGrade && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-accent/40 text-accent-light bg-accent/10 font-bold">
                    {setup.qualityGrade}
                  </span>
                )}
                {setup.confidenceScore != null && (
                  <span className="text-[11px] font-mono text-accent-light">{setup.confidenceScore}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close"
              className="w-8 h-8 rounded-lg bg-surface-2/60 border border-border hover:border-border-light flex items-center justify-center text-muted hover:text-foreground transition-smooth shrink-0">
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading ? (
            <div className="py-10 text-center text-muted text-sm">Checking your linked accounts…</div>
          ) : accounts.length === 0 ? (
            <NoAccountState onClose={onClose} />
          ) : resultStage === "done" ? (
            <ResultPanel result={result} onDismiss={onClose} />
          ) : (
            <>
              {/* Prefilled levels */}
              <div className="rounded-xl bg-surface-2/60 border border-border/50 p-3 grid grid-cols-3 gap-3 text-xs">
                <Level label="Entry" value={setup.entry ?? null} />
                <Level label="Stop" value={setup.stopLoss ?? null} tone="bear" />
                <Level label="Target" value={setup.takeProfit ?? null} tone="bull" />
              </div>
              {rr !== null && (
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>Risk/Reward</span>
                  <span className={cn("font-mono font-semibold", rr >= 2 ? "text-bull-light" : rr < 1 ? "text-bear-light" : "text-foreground")}>
                    {rr.toFixed(2)}R
                  </span>
                </div>
              )}

              {/* Account picker */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">Send to account</div>
                <div className="grid gap-2">
                  {accounts.map((a) => {
                    const active = a.id === accountId;
                    return (
                      <button
                        key={a.id}
                        onClick={() => setAccountId(a.id)}
                        className={cn(
                          "text-left p-3 rounded-xl border transition-smooth",
                          active
                            ? "border-accent/40 bg-accent/10 shadow-[0_0_20px_var(--color-accent-glow)]"
                            : "border-border bg-surface-2/50 hover:border-border-light",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn("text-[10px] font-bold tracking-wider", active ? "text-accent-light" : "text-muted")}>
                              {a.platformType}
                            </span>
                            <span className="font-mono text-sm font-semibold truncate">#{a.accountLogin}</span>
                          </div>
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border shrink-0",
                            a.connectionStatus === "linked"
                              ? "border-bull/40 text-bull-light bg-bull/10"
                              : "border-bear/40 text-bear-light bg-bear/10",
                          )}>
                            {a.connectionStatus.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-light truncate mt-0.5">{a.brokerName}{a.accountLabel ? ` · ${a.accountLabel}` : ""}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sizing */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Position size</div>
                  <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-[11px]">
                    <button onClick={() => setSizingMode("fixed_lots")}
                      className={cn("px-2.5 py-1 rounded-md font-semibold transition-smooth",
                        sizingMode === "fixed_lots" ? "bg-accent/20 text-accent-light" : "text-muted")}>
                      Lots
                    </button>
                    <button onClick={() => setSizingMode("risk_percent")}
                      className={cn("px-2.5 py-1 rounded-md font-semibold transition-smooth",
                        sizingMode === "risk_percent" ? "bg-accent/20 text-accent-light" : "text-muted")}>
                      Risk %
                    </button>
                  </div>
                </div>
                {sizingMode === "fixed_lots" ? (
                  <div className="flex gap-1.5">
                    <input
                      type="number" step="0.01" min="0.01"
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                      className="input font-mono text-base flex-1"
                    />
                    <div className="flex gap-1">
                      {["0.05", "0.10", "0.25", "0.50", "1.00"].map((q) => (
                        <button key={q} onClick={() => setVolume(q)}
                          className={cn("px-2 text-[11px] rounded-lg border transition-smooth",
                            volume === q ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border text-muted-light hover:border-border-light")}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <input
                      type="number" step="0.1" min="0.1" max="10"
                      value={riskPct}
                      onChange={(e) => setRiskPct(e.target.value)}
                      className="input font-mono text-base"
                    />
                    <div className="text-[10px] text-muted mt-1">
                      Server derives lots from stop distance and your account balance.
                    </div>
                  </>
                )}
              </div>

              {error && <div className="text-xs text-bear-light bg-bear/5 border border-bear/30 rounded-lg p-2.5">{error}</div>}
              {warnings.length > 0 && (
                <div className="text-xs text-warn bg-warn/5 border border-warn/30 rounded-lg p-2.5 space-y-1">
                  {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              {resultStage === "confirm" && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
                  <div className="text-[10px] font-bold tracking-[0.18em] text-accent-light uppercase mb-1">Confirm</div>
                  <div className="text-sm font-mono">
                    {side.toUpperCase()} {volume} lots {setup.symbol} @ market
                    {selectedAccount && <span className="text-muted"> → #{selectedAccount.accountLogin}</span>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {!loading && accounts.length > 0 && resultStage !== "done" && (
          <div className="p-4 sm:p-5 border-t border-border/60 bg-surface shrink-0">
            {resultStage === "form" ? (
              <button
                onClick={runValidateAndConfirm}
                disabled={submitting || !accountId}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-sm transition-smooth disabled:opacity-50",
                  side === "buy"
                    ? "bg-bull/20 text-bull-light border border-bull/40 hover:bg-bull/30"
                    : "bg-bear/20 text-bear-light border border-bear/40 hover:bg-bear/30",
                )}
              >
                {submitting ? "Validating…" : `Review ${side.toUpperCase()} order`}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setResultStage("form")} disabled={submitting} className="btn-secondary">← Edit</button>
                <button onClick={submitOrder} disabled={submitting} className="btn-primary">
                  {submitting ? "Sending…" : "Send to broker"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NoAccountState({ onClose }: { onClose: () => void }) {
  return (
    <div className="text-center py-6 space-y-3">
      <div className="text-3xl">🔗</div>
      <h3 className="text-fluid-lg font-semibold">No MT account connected</h3>
      <p className="text-fluid-sm text-muted-light max-w-xs mx-auto">
        Link an MT4 or MT5 account in the Trading Hub, then come back here and tap Execute.
      </p>
      <div className="flex gap-2 justify-center pt-2">
        <button onClick={onClose} className="btn-ghost text-xs">Not now</button>
        <Link onClick={onClose} href="/dashboard/mt5-hub" className="btn-primary text-xs">Connect account →</Link>
      </div>
    </div>
  );
}

function ResultPanel({ result, onDismiss }: { result: any; onDismiss: () => void }) {
  const r = result?.result;
  if (!r) return null;
  const ok = r.executionStatus === "accepted" || r.executionStatus === "partial";
  const pending = r.executionStatus === "pending";
  const rejected = r.executionStatus === "rejected" || r.executionStatus === "error";

  return (
    <div className={cn(
      "rounded-xl p-4 space-y-3 border-2",
      ok ? "border-bull/40 bg-bull/5" : pending ? "border-warn/40 bg-warn/5" : "border-bear/40 bg-bear/5",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0",
          ok ? "bg-bull/15 text-bull-light" : pending ? "bg-warn/15 text-warn" : "bg-bear/15 text-bear-light",
        )}>
          {ok ? "✓" : pending ? "⧗" : "✕"}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold">
            {ok ? "Order accepted" : pending ? "Order queued" : "Order rejected"}
          </h4>
          <p className="text-xs text-muted-light mt-1">
            {ok && "Fill confirmed. Position is now active on your MT terminal."}
            {pending && "Waiting for your MT bridge to pick up and execute the order."}
            {rejected && (r.rejectionReason ?? "The broker adapter rejected the order.")}
          </p>
        </div>
      </div>
      {r.brokerTicketRef && (
        <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-border/40">
          <KV label="Ticket" value={r.brokerTicketRef} mono />
          <KV label="Fill" value={r.fillPrice != null ? String(r.fillPrice) : "—"} mono />
        </div>
      )}
      <div className="flex gap-2">
        <Link href={`/dashboard/trading/executions/${result.request.id}`} className="btn-secondary flex-1 justify-center text-xs">Details</Link>
        <button onClick={onDismiss} className="btn-primary flex-1 text-xs">Done</button>
      </div>
    </div>
  );
}

function Level({ label, value, tone }: { label: string; value: number | null; tone?: "bull" | "bear" }) {
  return (
    <div className="text-center">
      <div className={cn("text-[9px] uppercase tracking-wider mb-0.5",
        tone === "bull" ? "text-bull-light" : tone === "bear" ? "text-bear-light" : "text-muted",
      )}>{label}</div>
      <div className={cn("text-sm font-bold font-mono",
        tone === "bull" ? "text-bull-light" : tone === "bear" ? "text-bear-light" : "text-foreground",
      )}>{value != null ? value : "—"}</div>
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted text-[10px] uppercase tracking-wider">{label}</div>
      <div className={cn("mt-0.5 truncate", mono && "font-mono")}>{value}</div>
    </div>
  );
}
