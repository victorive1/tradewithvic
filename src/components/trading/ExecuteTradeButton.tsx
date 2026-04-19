"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getOrCreateUserKey } from "@/lib/trading/user-key-client";

const MT_ACCOUNTS_KEY = "mt_accounts";

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
  takeProfit2?: number | null;
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
  baseCurrency?: string | null;
  balance?: number | null;
}

// Pip size for common asset classes. Approximate but fine for UI preview.
function pipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 0.01;
  if (s.startsWith("XAU")) return 0.1;
  if (s.startsWith("XAG")) return 0.01;
  if (/(BTC|ETH|SOL|XRP|ADA|DOGE|BNB|LTC)/.test(s)) return 1;
  if (/(US30|DJI|US500|SPX|NAS100|NDX|GER40|UK100|JP225|AUS200|HK50)/.test(s)) return 1;
  return 0.0001;
}

// Approximate USD pip value per 1.0 standard lot.
function pipValuePerLotUSD(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.startsWith("XAU")) return 10;
  if (s.startsWith("XAG")) return 50;
  if (s.includes("JPY")) return 9;
  if (/(BTC|ETH|SOL|XRP|ADA|DOGE|BNB|LTC)/.test(s)) return 1;
  if (/(US30|DJI|US500|SPX|NAS100|NDX|GER40|UK100|JP225|AUS200|HK50)/.test(s)) return 1;
  return 10;
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
  // Seed accounts synchronously from localStorage so the form renders
  // instantly — no "Checking your linked accounts…" spinner when the user
  // already has accounts cached locally. Backend sync runs in the background
  // and swaps in real account ids when it resolves.
  const initialLocalAccounts: LinkedAccount[] = typeof window === "undefined"
    ? []
    : readLocalMtAccounts().map((a) => ({
        id: `local:${a.login}:${a.server}`,
        platformType: a.platform === "MT4" ? "MT4" : "MT5",
        brokerName: a.broker,
        accountLogin: a.login,
        accountLabel: a.label ?? null,
        connectionStatus: "linked",
        adapterKind: "mock",
      }));
  const [accounts, setAccounts] = useState<LinkedAccount[]>(initialLocalAccounts);
  // Only show the loading spinner when we have nothing to render up-front.
  const [loading, setLoading] = useState(initialLocalAccounts.length === 0);
  const [accountIds, setAccountIds] = useState<Set<string>>(
    initialLocalAccounts[0] ? new Set([initialLocalAccounts[0].id]) : new Set(),
  );

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

  // Background-sync local accounts into the backend and swap in real ids.
  // Migration POSTs fire in parallel (not awaited) so the UI never blocks.
  const loadAccounts = useCallback(async () => {
    if (!userKey) return;
    const local = readLocalMtAccounts();
    // Fire-and-forget migration; the GET below returns what's already synced
    // plus anything newly created.
    for (const a of local) {
      fetch("/api/trading/accounts", {
        method: "POST", headers,
        body: JSON.stringify({
          platformType: a.platform, brokerName: a.broker,
          serverName: a.server, accountLogin: a.login, accountLabel: a.label ?? null,
          adapterKind: "mock",
        }),
      }).catch(() => {});
    }
    try {
      const res = await fetch("/api/trading/accounts", { headers, cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const fetched: LinkedAccount[] = data.accounts ?? [];
      if (fetched.length === 0) return;
      // Swap in real backend accounts. Re-map any synthetic `local:login:server`
      // selections to the matching real account id so the user's selection
      // survives the handoff.
      setAccountIds((prev) => {
        if (prev.size === 0) return new Set([fetched[0].id]);
        const next = new Set<string>();
        for (const id of prev) {
          if (fetched.some((f) => f.id === id)) { next.add(id); continue; }
          if (id.startsWith("local:")) {
            const [, login] = id.split(":");
            const match = fetched.find((f) => f.accountLogin === login);
            if (match) next.add(match.id);
          }
        }
        if (next.size === 0) next.add(fetched[0].id);
        return next;
      });
      setAccounts(fetched);
    } finally { setLoading(false); }
  }, [userKey, headers]);

  // Track the in-flight sync so submit handlers can await it if the user
  // clicks Review before synthetic `local:` ids have been swapped for real ones.
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  useEffect(() => { loadPromiseRef.current = loadAccounts(); }, [loadAccounts]);

  async function ensureRealAccountIds() {
    const hasSynthetic = Array.from(accountIds).some((id) => id.startsWith("local:"));
    if (!hasSynthetic) return;
    try { await loadPromiseRef.current; } catch {}
  }

  function buildOrderPayload(accountId: string) {
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
    if (accountIds.size === 0) { setError("Select at least one linked trading account."); return; }
    if (!Number.isFinite(Number(volume)) || Number(volume) <= 0) {
      setError("Enter a lot size greater than zero."); return;
    }
    setSubmitting(true);
    try {
      await ensureRealAccountIds();
      const ids = Array.from(accountIds);
      const results = await Promise.all(ids.map(async (id) => {
        const res = await fetch("/api/trading/validate", {
          method: "POST", headers,
          body: JSON.stringify(buildOrderPayload(id)),
        });
        const data = await res.json().catch(() => ({}));
        return { id, httpOk: res.ok, status: res.status, data };
      }));
      const failed = results.find((r) => !r.httpOk || !r.data?.ok);
      if (failed) {
        const label = accounts.find((a) => a.id === failed.id);
        const where = label ? ` (${label.brokerName} · ${label.accountLogin})` : "";
        setError(`${failed.data?.error ?? `validate_${failed.status}`}${where}`);
        setWarnings(failed.data?.warnings ?? []);
        return;
      }
      const combinedWarnings = Array.from(new Set(results.flatMap((r) => r.data?.warnings ?? [])));
      setWarnings(combinedWarnings);
      setResultStage("confirm");
    } catch (e: any) {
      setError(e?.message ?? "network_error");
    } finally { setSubmitting(false); }
  }

  async function submitOrder() {
    setSubmitting(true); setError(null);
    try {
      await ensureRealAccountIds();
      const ids = Array.from(accountIds);
      const settled = await Promise.all(ids.map(async (id) => {
        try {
          const res = await fetch("/api/trading/execute", {
            method: "POST", headers,
            body: JSON.stringify({
              ...buildOrderPayload(id),
              sourceType: setup.sourceType ?? "setup",
              sourceRef: setup.sourceRef ?? null,
              comment: setup.setupType ? `${setup.setupType}${setup.timeframe ? ` · ${setup.timeframe}` : ""}` : null,
            }),
          });
          const data = await res.json().catch(() => ({}));
          return { accountId: id, ok: res.ok, status: res.status, data };
        } catch (e: any) {
          return { accountId: id, ok: false, status: 0, data: { error: e?.message ?? "network_error" } };
        }
      }));
      setResult({ perAccount: settled });
      setResultStage("done");
    } finally { setSubmitting(false); }
  }

  const selectedAccounts = accounts.filter((a) => accountIds.has(a.id));
  // First selected is used for per-account risk % preview (balance-scoped).
  const selectedAccount = selectedAccounts[0];
  const entryRef = orderType === "market" ? (setup.entry ?? entryNum) : entryNum;

  const psize = pipSize(setup.symbol);
  const pipDist = (() => {
    if (!entryRef || !slNum || psize <= 0) return null;
    return Math.abs(entryRef - slNum) / psize;
  })();
  const lotsNum = Number(volume);
  const riskUsd = (() => {
    if (pipDist == null || !Number.isFinite(lotsNum) || lotsNum <= 0) return null;
    return pipDist * pipValuePerLotUSD(setup.symbol) * lotsNum;
  })();
  const riskPctOfBalance = (() => {
    if (riskUsd == null || !selectedAccount?.balance || selectedAccount.balance <= 0) return null;
    return (riskUsd / selectedAccount.balance) * 100;
  })();
  const rr1 = (() => {
    if (!entryRef || !slNum || !setup.takeProfit) return null;
    const risk = Math.abs(entryRef - slNum);
    if (risk <= 0) return null;
    return Math.abs(setup.takeProfit - entryRef) / risk;
  })();
  const rr2 = (() => {
    if (!entryRef || !slNum || setup.takeProfit2 == null) return null;
    const risk = Math.abs(entryRef - slNum);
    if (risk <= 0) return null;
    return Math.abs(setup.takeProfit2 - entryRef) / risk;
  })();

  if (!mounted) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60]"
      style={{ height: "100dvh" }}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full sm:w-[460px] bg-surface border-l border-border/60 shadow-[0_0_60px_rgba(0,0,0,0.5)] flex flex-col">
        {/* Header */}
        <div className={cn("p-4 border-b border-border/60 relative overflow-hidden shrink-0")}>
          <div
            aria-hidden
            className="absolute inset-0 opacity-60 pointer-events-none"
            style={{
              background: side === "buy"
                ? "radial-gradient(circle at 50% 0%, rgba(16,185,129,0.22), transparent 60%)"
                : "radial-gradient(circle at 50% 0%, rgba(244,63,94,0.22), transparent 60%)",
            }}
          />
          <div className="relative flex items-start gap-3">
            <div
              className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold border shrink-0",
                side === "buy"
                  ? "bg-bull/15 border-bull/30 text-bull-light"
                  : "bg-bear/15 border-bear/30 text-bear-light",
              )}
            >
              {side === "buy" ? "▲" : "▼"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono font-bold text-lg text-foreground truncate">{setup.symbol}</span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider border",
                    side === "buy"
                      ? "bg-bull/10 text-bull-light border-bull/40"
                      : "bg-bear/10 text-bear-light border-bear/40",
                  )}
                >
                  {side}
                </span>
                {setup.timeframe && (
                  <span className="px-2 py-0.5 rounded-md font-mono text-[10px] bg-surface-2 border border-border/60 text-muted-light">
                    {setup.timeframe}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-light flex items-center gap-1.5 min-w-0">
                <span aria-hidden>📈</span>
                <span className="truncate">
                  {setup.setupType ?? "Trade"}
                  {setup.confidenceScore != null && ` · ${setup.confidenceScore}% confidence`}
                </span>
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
            <ResultPanel result={result} accounts={accounts} onDismiss={onClose} />
          ) : (
            <>
              {/* Signal Levels */}
              <section>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">Signal Levels</div>
                <div className="grid grid-cols-3 gap-2">
                  <LevelTile label="Entry" value={setup.entry} tone="entry" />
                  <LevelTile label="SL" value={setup.stopLoss} tone="bear" />
                  <LevelTile label="TP1" value={setup.takeProfit} tone="bull" />
                  {setup.takeProfit2 != null && (
                    <LevelTile label="TP2" value={setup.takeProfit2} tone="bull" />
                  )}
                </div>
              </section>

              {/* MT Account */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    MT Account{accountIds.size > 1 ? ` · ${accountIds.size} selected` : ""}
                  </div>
                  {accounts.length > 1 && (
                    <button
                      onClick={() => {
                        if (accountIds.size === accounts.length) setAccountIds(new Set());
                        else setAccountIds(new Set(accounts.map((a) => a.id)));
                      }}
                      className="text-[10px] text-accent-light hover:text-accent transition-smooth"
                    >
                      {accountIds.size === accounts.length ? "Clear all" : "Select all"}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {accounts.map((a) => {
                    const active = accountIds.has(a.id);
                    const isLinked = a.connectionStatus === "linked";
                    return (
                      <button
                        key={a.id}
                        onClick={() => {
                          setAccountIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(a.id)) next.delete(a.id);
                            else next.add(a.id);
                            return next;
                          });
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-xl border transition-smooth",
                          active
                            ? "border-bull/50 bg-bull/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                            : "border-border bg-surface-2/50 hover:border-border-light",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                isLinked ? "bg-bull" : "bg-bear",
                              )} />
                              <span className="font-semibold text-sm truncate">
                                {a.brokerName} · {a.accountLogin}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-light tracking-wide uppercase">
                              {a.platformType} · {a.connectionStatus}
                              {typeof a.balance === "number" && (
                                <span> · ${a.balance.toLocaleString()}</span>
                              )}
                            </div>
                          </div>
                          {active && (
                            <div className="w-5 h-5 rounded-full bg-bull flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"/>
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Lot Size + Order Type */}
              <section>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">Lot Size</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border/60 focus:border-accent focus:outline-none font-mono text-base"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">Order Type</div>
                    <select
                      value={orderType}
                      onChange={(e) => setOrderType(e.target.value as "market" | "limit" | "stop")}
                      className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border/60 focus:border-accent focus:outline-none text-sm"
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                      <option value="stop">Stop</option>
                    </select>
                    <div className="text-[10px] text-muted mt-1.5">
                      {orderType === "market" && "Fill at current market price"}
                      {orderType === "limit" && "Waits for price to reach entry"}
                      {orderType === "stop" && "Triggers when entry breaks"}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {["0.01", "0.05", "0.10", "0.25", "0.50", "1.00"].map((p) => (
                    <button
                      key={p}
                      onClick={() => setVolume(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-mono rounded-lg border transition-smooth",
                        volume === p
                          ? "bg-accent/20 border-accent/50 text-accent-light"
                          : "bg-surface-2 border-border/60 text-muted-light hover:border-border-light",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </section>

              {/* Risk Preview */}
              <section>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">Risk Preview</div>
                <div className="rounded-xl border border-border/60 bg-surface-2/30 p-3 space-y-2">
                  <RiskRow
                    label="Pip Distance"
                    value={pipDist != null ? `${pipDist.toLocaleString(undefined, { maximumFractionDigits: 0 })} pips` : "—"}
                  />
                  <RiskRow
                    label="$ Risk"
                    value={riskUsd != null ? `$${riskUsd.toFixed(2)}` : "—"}
                    tone="bear"
                  />
                  <RiskRow
                    label="Risk %"
                    value={riskPctOfBalance != null ? `${riskPctOfBalance.toFixed(2)}%` : "—"}
                  />
                  <RiskRow
                    label="R:R to TP1"
                    value={rr1 != null ? `1 : ${rr1.toFixed(2)}` : "—"}
                    tone={rr1 != null && rr1 >= 2 ? "bull" : undefined}
                  />
                  {setup.takeProfit2 != null && (
                    <RiskRow
                      label="R:R to TP2"
                      value={rr2 != null ? `1 : ${rr2.toFixed(2)}` : "—"}
                      tone={rr2 != null && rr2 >= 2 ? "bull" : undefined}
                    />
                  )}
                </div>
              </section>

              {error && <div className="text-xs text-bear-light bg-bear/5 border border-bear/30 rounded-lg p-2.5">{error}</div>}
              {warnings.length > 0 && (
                <div className="text-xs text-warn bg-warn/5 border border-warn/30 rounded-lg p-2.5 space-y-1">
                  {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              {resultStage === "confirm" && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-1">
                  <div className="text-[10px] font-bold tracking-[0.18em] text-accent-light uppercase">
                    Confirm{selectedAccounts.length > 1 ? ` · ${selectedAccounts.length} accounts` : ""}
                  </div>
                  <div className="text-sm font-mono font-semibold">
                    {side.toUpperCase()} {volume} lots {setup.symbol}
                    <span className="text-muted"> · {orderType.toUpperCase()}</span>
                    {orderType === "market" && <span className="text-muted"> @ market</span>}
                    {orderType !== "market" && setup.entry != null && <span className="text-muted"> @ {setup.entry}</span>}
                  </div>
                  <div className="text-[11px] text-muted font-mono">
                    SL {setup.stopLoss ?? "—"} · TP {setup.takeProfit ?? "—"}
                  </div>
                  {selectedAccounts.length > 0 && (
                    <div className="text-[11px] text-muted-light space-y-0.5 pt-1">
                      {selectedAccounts.map((a) => (
                        <div key={a.id} className="font-mono">→ {a.brokerName} · #{a.accountLogin}</div>
                      ))}
                    </div>
                  )}
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
                disabled={submitting || accountIds.size === 0}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-sm transition-smooth disabled:opacity-50",
                  side === "buy"
                    ? "bg-bull/20 text-bull-light border border-bull/40 hover:bg-bull/30"
                    : "bg-bear/20 text-bear-light border border-bear/40 hover:bg-bear/30",
                )}
              >
                {submitting
                  ? "Validating…"
                  : `Review ${side.toUpperCase()} order${accountIds.size > 1 ? ` · ${accountIds.size} accounts` : ""}`}
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

function ResultPanel({ result, accounts, onDismiss }: {
  result: any;
  accounts: LinkedAccount[];
  onDismiss: () => void;
}) {
  // Multi-account shape: { perAccount: [{ accountId, ok, data }] }
  const perAccount: Array<{ accountId: string; ok: boolean; status: number; data: any }> =
    result?.perAccount ?? (result?.request ? [{ accountId: result.request.accountId, ok: true, status: 200, data: result }] : []);
  if (perAccount.length === 0) return null;

  const resolved = perAccount.map((entry) => {
    const acct = accounts.find((a) => a.id === entry.accountId);
    return { ...entry, acct };
  });

  return (
    <div className="space-y-3">
      {resolved.map((entry) => (
        <AccountResultTile key={entry.accountId} entry={entry} />
      ))}
      <button onClick={onDismiss} className="btn-primary w-full text-xs">Done</button>
    </div>
  );
}

function AccountResultTile({ entry }: {
  entry: {
    accountId: string;
    ok: boolean;
    status: number;
    data: any;
    acct: LinkedAccount | undefined;
  };
}) {
  const r = entry.ok ? entry.data?.result : null;
  const httpError = !entry.ok ? (entry.data?.message ?? entry.data?.error ?? `error_${entry.status}`) : null;
  const adapterKind: string | undefined = (() => {
    try { return JSON.parse(r?.adapterResponse ?? "{}").kind; } catch { return undefined; }
  })();
  const ok = r?.executionStatus === "accepted" || r?.executionStatus === "partial";
  const pending = r?.executionStatus === "pending";
  const isDemo = adapterKind === "mock";
  const acctLabel = entry.acct ? `${entry.acct.brokerName} · ${entry.acct.accountLogin}` : entry.accountId;

  return (
    <div className={cn(
      "rounded-xl p-4 space-y-2 border-2",
      httpError ? "border-bear/40 bg-bear/5" :
      ok ? "border-bull/40 bg-bull/5" :
      pending ? "border-warn/40 bg-warn/5" :
      "border-bear/40 bg-bear/5",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold shrink-0",
          httpError ? "bg-bear/15 text-bear-light" :
          ok ? "bg-bull/15 text-bull-light" :
          pending ? "bg-warn/15 text-warn" :
          "bg-bear/15 text-bear-light",
        )}>
          {httpError || !ok && !pending ? "✕" : ok ? "✓" : "⧗"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold truncate">{acctLabel}</h4>
            {isDemo && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-warn/15 text-warn border border-warn/30 font-bold tracking-wider uppercase">Demo</span>
            )}
          </div>
          <p className="text-xs text-muted-light mt-1">
            {httpError ? httpError :
              ok && isDemo ? "Simulated fill — account is in Demo mode." :
              ok ? "Fill confirmed. Position is active on your MT terminal." :
              pending ? "Order queued. Your MT bridge picks it up next." :
              (r?.rejectionReason ?? "The broker adapter rejected the order.")}
          </p>
        </div>
      </div>
      {r?.brokerTicketRef && (
        <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-border/40">
          <KV label="Ticket" value={r.brokerTicketRef} mono />
          <KV label="Fill" value={r.fillPrice != null ? String(r.fillPrice) : "—"} mono />
        </div>
      )}
      {entry.ok && entry.data?.request?.id && (
        <Link
          href={`/dashboard/trading/executions/${entry.data.request.id}`}
          className="text-[11px] text-accent-light hover:text-accent transition-smooth inline-block"
        >
          View details →
        </Link>
      )}
    </div>
  );
}

function LevelTile({ label, value, tone }: {
  label: string;
  value: number | null | undefined;
  tone: "entry" | "bull" | "bear";
}) {
  const toneColor =
    tone === "bull" ? "text-bull-light" :
    tone === "bear" ? "text-bear-light" :
    "text-accent-light";
  return (
    <div className="rounded-xl border border-border/60 bg-surface-2/50 p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className={cn("font-mono font-bold text-sm tabular-nums", toneColor)}>
        {value != null ? String(value) : "—"}
      </div>
    </div>
  );
}

function RiskRow({ label, value, tone }: {
  label: string;
  value: string;
  tone?: "bull" | "bear";
}) {
  const toneColor =
    tone === "bull" ? "text-bull-light" :
    tone === "bear" ? "text-bear-light" :
    "text-foreground";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-light">{label}</span>
      <span className={cn("font-mono font-semibold tabular-nums", toneColor)}>{value}</span>
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
