"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  adapterKind: string;
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

  // Editable order fields — prefilled from the setup, user can override
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [entry, setEntry] = useState<string>(setup.entry != null ? String(setup.entry) : "");
  const [sl, setSl] = useState<string>(setup.stopLoss != null ? String(setup.stopLoss) : "");
  const [tp, setTp] = useState<string>(setup.takeProfit != null ? String(setup.takeProfit) : "");

  const [sizingMode, setSizingMode] = useState<"fixed_lots" | "risk_percent">("fixed_lots");
  const [volume, setVolume] = useState("0.10");
  const [riskPct, setRiskPct] = useState("1.0");
  const [slippage, setSlippage] = useState("10");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [resultStage, setResultStage] = useState<"form" | "confirm" | "done">("form");
  const [result, setResult] = useState<any>(null);

  const headers = useMemo(
    () => ({ "Content-Type": "application/json", "x-trading-user-key": userKey, "x-billing-user-key": userKey }),
    [userKey],
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); setUserKey(getOrCreateUserKey()); }, []);

  function resetLevelsToSetup() {
    setEntry(setup.entry != null ? String(setup.entry) : "");
    setSl(setup.stopLoss != null ? String(setup.stopLoss) : "");
    setTp(setup.takeProfit != null ? String(setup.takeProfit) : "");
    setOrderType("market");
  }

  const entryNum = Number(entry);
  const slNum = Number(sl);
  const tpNum = Number(tp);
  const levelsEdited =
    (setup.entry != null && entry !== String(setup.entry)) ||
    (setup.stopLoss != null && sl !== String(setup.stopLoss)) ||
    (setup.takeProfit != null && tp !== String(setup.takeProfit));

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
            // Default new accounts to mock adapter so the execute flow completes
            // end-to-end with simulated fills. Users upgrade to metaapi /
            // ea_webhook per-account once they install a real bridge.
            adapterKind: "mock",
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

  function buildOrderPayload() {
    return {
      accountId,
      internalSymbol: setup.symbol,
      side,
      orderType,
      requestedVolume: Number(volume),
      sizingMode,
      riskPercent: sizingMode === "risk_percent" ? Number(riskPct) : undefined,
      entryPrice: orderType === "market" ? null : (Number.isFinite(entryNum) && entryNum > 0 ? entryNum : null),
      stopLoss: Number.isFinite(slNum) && slNum > 0 ? slNum : null,
      takeProfit: Number.isFinite(tpNum) && tpNum > 0 ? tpNum : null,
      slippagePips: orderType === "market" ? Number(slippage) : null,
      currentPrice: setup.entry ?? (Number.isFinite(entryNum) && entryNum > 0 ? entryNum : null),
    };
  }

  async function runValidateAndConfirm() {
    setError(null); setWarnings([]);
    if (!accountId) { setError("Select a linked trading account first."); return; }
    if (!Number.isFinite(Number(volume)) || Number(volume) <= 0) {
      setError("Enter a lot size greater than zero."); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/trading/validate", {
        method: "POST", headers,
        body: JSON.stringify(buildOrderPayload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `validate_${res.status}`); return;
      }
      if (!data.ok) {
        setError(data.error ?? "validation_failed");
        setWarnings(data.warnings ?? []);
        return;
      }
      setWarnings(data.warnings ?? []);
      setResultStage("confirm");
    } catch (e: any) {
      setError(e?.message ?? "network_error");
    } finally { setSubmitting(false); }
  }

  async function submitOrder() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/trading/execute", {
        method: "POST", headers,
        body: JSON.stringify({
          ...buildOrderPayload(),
          sourceType: setup.sourceType ?? "setup",
          sourceRef: setup.sourceRef ?? null,
          comment: setup.setupType ? `${setup.setupType}${setup.timeframe ? ` · ${setup.timeframe}` : ""}` : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? `execute_${res.status}`);
        return;
      }
      setResult(data);
      setResultStage("done");
    } catch (e: any) {
      setError(e?.message ?? "network_error");
    } finally { setSubmitting(false); }
  }

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const entryRef = orderType === "market" ? (setup.entry ?? entryNum) : entryNum;
  const rr = (() => {
    if (!entryRef || !slNum || !tpNum) return null;
    const risk = Math.abs(entryRef - slNum);
    const reward = Math.abs(tpNum - entryRef);
    if (risk <= 0) return null;
    return reward / risk;
  })();

  if (!mounted) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ height: "100dvh" }}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface border border-border/60 sm:rounded-2xl rounded-t-3xl shadow-[0_30px_80px_rgba(0,0,0,0.5)] flex flex-col"
        style={{ maxHeight: "min(92dvh, 760px)" }}>
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
              {/* Order type */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">Order type</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ["market", "Market"],
                    ["limit",  "Limit"],
                    ["stop",   "Stop"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setOrderType(id)}
                      className={cn(
                        "py-2.5 rounded-xl text-[12px] font-semibold border transition-smooth",
                        orderType === id
                          ? "bg-accent/15 border-accent/40 text-accent-light shadow-[0_0_14px_var(--color-accent-glow)]"
                          : "bg-surface-2 border-border/50 text-muted-light hover:border-border-light",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted mt-1.5">
                  {orderType === "market" && "Fills at the next available price."}
                  {orderType === "limit" && "Pending order — waits for price to reach entry."}
                  {orderType === "stop" && "Pending order — triggers when price breaks entry."}
                </p>
              </div>

              {/* Editable levels */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Levels</div>
                  {levelsEdited && (
                    <button onClick={resetLevelsToSetup} className="text-[10px] text-accent-light hover:text-accent transition-smooth">
                      ↺ Reset to setup
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <LevelInput
                    label="Entry"
                    value={entry}
                    onChange={setEntry}
                    disabled={orderType === "market"}
                    placeholder={orderType === "market" ? "Market" : "—"}
                  />
                  <LevelInput label="Stop" value={sl} onChange={setSl} tone="bear" placeholder="—" />
                  <LevelInput label="Target" value={tp} onChange={setTp} tone="bull" placeholder="—" />
                </div>
                {rr !== null && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40 text-[11px]">
                    <span className="text-muted">Risk/Reward</span>
                    <span className={cn("font-mono font-bold", rr >= 2 ? "text-bull-light" : rr < 1 ? "text-bear-light" : "text-foreground")}>
                      {rr.toFixed(2)}R
                    </span>
                  </div>
                )}
              </div>

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
                        <div className="flex items-center justify-between mt-0.5">
                          <div className="text-[11px] text-muted-light truncate">{a.brokerName}{a.accountLabel ? ` · ${a.accountLabel}` : ""}</div>
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider uppercase shrink-0 ml-2",
                            a.adapterKind === "mock" ? "bg-warn/10 text-warn border border-warn/30"
                            : a.adapterKind === "pending_queue" ? "bg-accent/10 text-accent-light border border-accent/30"
                            : a.adapterKind === "metaapi" || a.adapterKind === "ea_webhook" ? "bg-bull/10 text-bull-light border border-bull/30"
                            : "bg-bear/10 text-bear-light border border-bear/30"
                          )}>
                            {a.adapterKind === "mock" ? "DEMO"
                             : a.adapterKind === "pending_queue" ? "QUEUE"
                             : a.adapterKind === "metaapi" ? "LIVE"
                             : a.adapterKind === "ea_webhook" ? "LIVE"
                             : "OFF"}
                          </span>
                        </div>
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

              {/* Slippage (market only) */}
              {orderType === "market" && (
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted block mb-1.5">
                    Max slippage (pips)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    className="input font-mono"
                  />
                </div>
              )}

              {error && <div className="text-xs text-bear-light bg-bear/5 border border-bear/30 rounded-lg p-2.5">{error}</div>}
              {warnings.length > 0 && (
                <div className="text-xs text-warn bg-warn/5 border border-warn/30 rounded-lg p-2.5 space-y-1">
                  {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              {resultStage === "confirm" && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-1">
                  <div className="text-[10px] font-bold tracking-[0.18em] text-accent-light uppercase">Confirm</div>
                  <div className="text-sm font-mono font-semibold">
                    {side.toUpperCase()} {volume} lots {setup.symbol}
                    <span className="text-muted"> · {orderType.toUpperCase()}</span>
                    {orderType !== "market" && entry && <span className="text-muted"> @ {entry}</span>}
                    {orderType === "market" && <span className="text-muted"> @ market</span>}
                  </div>
                  <div className="text-[11px] text-muted font-mono">
                    SL {sl || "—"} · TP {tp || "—"}
                    {selectedAccount && <span> → #{selectedAccount.accountLogin}</span>}
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
    </div>,
    document.body,
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
        <Link onClick={onClose} href="/dashboard/trading-hub" className="btn-primary text-xs">Connect account →</Link>
      </div>
    </div>
  );
}

function ResultPanel({ result, onDismiss }: { result: any; onDismiss: () => void }) {
  const r = result?.result;
  if (!r) return null;
  const adapterKind: string | undefined = (() => {
    try { return JSON.parse(r.adapterResponse ?? "{}").kind; } catch { return undefined; }
  })();
  const ok = r.executionStatus === "accepted" || r.executionStatus === "partial";
  const pending = r.executionStatus === "pending";
  const rejected = r.executionStatus === "rejected" || r.executionStatus === "error";
  const isDemo = adapterKind === "mock";

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
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold">
              {ok ? (isDemo ? "Demo fill accepted" : "Order accepted") : pending ? "Order queued" : "Order rejected"}
            </h4>
            {isDemo && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-warn/15 text-warn border border-warn/30 font-bold tracking-wider uppercase">
                Demo
              </span>
            )}
          </div>
          <p className="text-xs text-muted-light mt-1">
            {ok && isDemo && "Simulated fill — account is in Demo mode. Ticket, price, and commission are synthetic so you can validate the flow. Switch the account to Live to route to a real MT bridge."}
            {ok && !isDemo && "Fill confirmed. Position is now active on your MT terminal."}
            {pending && "Order is saved as pending. Your MT bridge (EA or MetaAPI) picks it up next and reports the real fill."}
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

function LevelInput({
  label, value, onChange, tone, disabled, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tone?: "bull" | "bear";
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={cn(
      "block rounded-xl border bg-surface-2/60 p-2.5 focus-within:border-accent/60 focus-within:shadow-[0_0_14px_var(--color-accent-glow)] transition-smooth",
      disabled ? "opacity-60 border-border/40" : "border-border/50",
    )}>
      <span className={cn("text-[9px] font-semibold uppercase tracking-wider block mb-1",
        tone === "bull" ? "text-bull-light" : tone === "bear" ? "text-bear-light" : "text-muted",
      )}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full bg-transparent border-none outline-none font-mono font-bold text-sm tabular-nums placeholder:text-muted",
          tone === "bull" ? "text-bull-light" : tone === "bear" ? "text-bear-light" : "text-foreground",
        )}
      />
    </label>
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
