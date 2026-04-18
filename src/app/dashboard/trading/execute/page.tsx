"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const USERKEY_STORAGE = "tradewithvic_billing_user_key";
const MT_ACCOUNTS_KEY = "mt_accounts";

interface LinkedAccount {
  id: string;
  platformType: "MT4" | "MT5";
  brokerName: string;
  serverName: string;
  accountLogin: string;
  accountLabel: string | null;
  baseCurrency: string;
  connectionStatus: string;
  adapterKind: string;
}

interface MappingRule {
  internalSymbol: string;
  digits: number | null;
  contractSize: number | null;
  minVolume: number | null;
  maxVolume: number | null;
  volumeStep: number | null;
}

interface ValidationResponse {
  ok: boolean;
  error: string | null;
  warnings: string[];
  brokerSymbol?: string;
  mappingFound?: boolean;
  contractSize?: number | null;
}

interface ExecutionResult {
  executionStatus: string;
  brokerTicketRef: string | null;
  fillPrice: number | null;
  filledVolume: number | null;
  slippagePips: number | null;
  commissionCost: number | null;
  rejectionReason: string | null;
}

const SYMBOL_CHOICES = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "XAUUSD", "XAGUSD",
  "US30", "NAS100", "SPX500",
  "BTCUSD", "ETHUSD",
];

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

export default function ExecuteTradePage() {
  const [userKey, setUserKey] = useState("");
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [mappingRules, setMappingRules] = useState<MappingRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Ticket state
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState("EURUSD");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [sizingMode, setSizingMode] = useState<"fixed_lots" | "risk_percent">("fixed_lots");
  const [volume, setVolume] = useState("0.10");
  const [riskPct, setRiskPct] = useState("1.0");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [slippage, setSlippage] = useState("10");
  const [comment, setComment] = useState("");
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmStage, setConfirmStage] = useState(false);
  const [lastResult, setLastResult] = useState<{ requestId: string; result: ExecutionResult } | null>(null);

  const headers = useMemo(
    () => ({ "Content-Type": "application/json", "x-trading-user-key": userKey, "x-billing-user-key": userKey }),
    [userKey]
  );

  useEffect(() => { setUserKey(getOrCreateUserKey()); }, []);

  const loadAccounts = useCallback(async () => {
    if (!userKey) return;
    setLoading(true);
    try {
      // Seed localStorage accounts into the backend on first load so users who
      // already linked their MT don't see an empty picker.
      const local = readLocalMtAccounts();
      for (const a of local) {
        await fetch("/api/trading/accounts", {
          method: "POST", headers,
          body: JSON.stringify({
            platformType: a.platform,
            brokerName: a.broker,
            serverName: a.server,
            accountLogin: a.login,
            accountLabel: a.label ?? null,
          }),
        }).catch(() => {});
      }
      const res = await fetch("/api/trading/accounts", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);
        if (!accountId && data.accounts?.[0]?.id) setAccountId(data.accounts[0].id);
      }
      const mapRes = await fetch("/api/trading/symbol-mapping", { headers, cache: "no-store" });
      if (mapRes.ok) {
        const md = await mapRes.json();
        setMappingRules(md.rules ?? []);
      }
    } finally { setLoading(false); }
  }, [userKey, headers, accountId]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // Pull a current mark for the symbol so preview + validation warnings work
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/market/quotes");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const q = data.quotes?.find((x: any) => x.symbol === symbol);
        if (q) setCurrentPrice(q.price);
      } catch { /* silent */ }
    }
    tick();
    const int = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(int); };
  }, [symbol]);

  const currentRule = mappingRules.find((r) => r.internalSymbol === symbol);
  const entryRef = orderType === "market" ? (currentPrice ?? 0) : Number(entry);
  const slNum = Number(sl);
  const tpNum = Number(tp);
  const rr = (() => {
    if (!entryRef || !slNum || !tpNum) return null;
    const risk = Math.abs(entryRef - slNum);
    const reward = Math.abs(tpNum - entryRef);
    if (risk <= 0) return null;
    return reward / risk;
  })();

  async function runValidate(): Promise<ValidationResponse | null> {
    setValidating(true);
    try {
      const res = await fetch("/api/trading/validate", {
        method: "POST", headers,
        body: JSON.stringify({
          accountId,
          internalSymbol: symbol,
          side, orderType,
          requestedVolume: Number(volume),
          sizingMode,
          riskPercent: sizingMode === "risk_percent" ? Number(riskPct) : undefined,
          entryPrice: orderType === "market" ? null : Number(entry),
          stopLoss: sl ? Number(sl) : null,
          takeProfit: tp ? Number(tp) : null,
          slippagePips: slippage ? Number(slippage) : null,
          currentPrice,
        }),
      });
      const data = await res.json();
      setValidation(data);
      return data;
    } finally { setValidating(false); }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/trading/execute", {
        method: "POST", headers,
        body: JSON.stringify({
          accountId,
          internalSymbol: symbol,
          side, orderType,
          requestedVolume: Number(volume),
          sizingMode,
          riskPercent: sizingMode === "risk_percent" ? Number(riskPct) : null,
          entryPrice: orderType === "market" ? null : Number(entry),
          stopLoss: sl ? Number(sl) : null,
          takeProfit: tp ? Number(tp) : null,
          slippagePips: slippage ? Number(slippage) : null,
          comment: comment || null,
          currentPrice,
          sourceType: "manual",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setValidation({ ok: false, error: data.message ?? data.error ?? "execute_failed", warnings: [] });
        setConfirmStage(false);
        return;
      }
      setLastResult({ requestId: data.request.id, result: data.result });
      setConfirmStage(false);
      setValidation(null);
    } finally { setSubmitting(false); }
  }

  const selectedAccount = accounts.find((a) => a.id === accountId);

  return (
    <div className="page-container space-y-6 max-w-4xl">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-fluid-3xl font-bold">Execute Trade</h1>
          <p className="text-fluid-sm text-muted-light mt-1">
            Send a live order directly to your linked MT4 or MT5 account.
          </p>
        </div>
        <Link href="/dashboard/trading/executions" className="btn-ghost">
          ↳ Execution history
        </Link>
      </header>

      {loading && <div className="glass-card p-10 text-center text-muted">Loading your linked accounts…</div>}

      {!loading && accounts.length === 0 && (
        <section className="glass-card p-10 text-center space-y-4">
          <div className="text-3xl">🔗</div>
          <h2 className="text-fluid-xl font-semibold">No linked trading accounts yet</h2>
          <p className="text-fluid-sm text-muted-light max-w-md mx-auto">
            Link an MT4 or MT5 account from the MT5 Multi Account Hub before you can place direct orders.
          </p>
          <Link href="/dashboard/mt5-hub" className="btn-primary inline-flex">Go to MT5 Hub →</Link>
        </section>
      )}

      {!loading && accounts.length > 0 && !lastResult && (
        <>
          {/* Account selector */}
          <section className="glass-card p-4 sm:p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">Account</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                        : "border-border bg-surface-2/50 hover:border-border-light"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("text-[10px] font-bold tracking-wider", active ? "text-accent-light" : "text-muted")}>
                        {a.platformType}
                      </span>
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full border",
                        a.connectionStatus === "linked"
                          ? "border-bull/40 text-bull-light bg-bull/10"
                          : "border-bear/40 text-bear-light bg-bear/10"
                      )}>
                        {a.connectionStatus.toUpperCase()}
                      </span>
                    </div>
                    <div className="font-mono text-sm font-semibold truncate">#{a.accountLogin}</div>
                    <div className="text-[11px] text-muted-light truncate">{a.brokerName}</div>
                    {a.accountLabel && <div className="text-[10px] text-muted truncate mt-0.5">{a.accountLabel}</div>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Order ticket */}
          <section className="glass-card p-4 sm:p-6 space-y-5">
            {/* Direction */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSide("buy")}
                className={cn(
                  "py-3.5 rounded-xl font-bold text-sm border transition-smooth",
                  side === "buy"
                    ? "bg-bull/15 border-bull/40 text-bull-light shadow-[0_0_24px_rgba(16,185,129,0.22)]"
                    : "bg-surface-2 border-border text-muted-light hover:border-border-light"
                )}
              >
                ▲ BUY
              </button>
              <button
                onClick={() => setSide("sell")}
                className={cn(
                  "py-3.5 rounded-xl font-bold text-sm border transition-smooth",
                  side === "sell"
                    ? "bg-bear/15 border-bear/40 text-bear-light shadow-[0_0_24px_rgba(244,63,94,0.22)]"
                    : "bg-surface-2 border-border text-muted-light hover:border-border-light"
                )}
              >
                ▼ SELL
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Symbol">
                <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="input">
                  {SYMBOL_CHOICES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {currentPrice && (
                  <div className="text-[10px] text-muted mt-1 font-mono">Mark · {currentPrice.toLocaleString(undefined, { minimumFractionDigits: currentRule?.digits ?? 2 })}</div>
                )}
              </Field>
              <Field label="Order type">
                <select value={orderType} onChange={(e) => setOrderType(e.target.value as any)} className="input">
                  <option value="market">Market</option>
                  <option value="limit">Limit (pending)</option>
                  <option value="stop">Stop (pending)</option>
                </select>
              </Field>
            </div>

            {/* Sizing */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Sizing</div>
                <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-[11px]">
                  <button onClick={() => setSizingMode("fixed_lots")}
                    className={cn("px-2.5 py-1 rounded-md font-semibold transition-smooth",
                      sizingMode === "fixed_lots" ? "bg-accent/20 text-accent-light" : "text-muted")}>
                    Fixed lots
                  </button>
                  <button onClick={() => setSizingMode("risk_percent")}
                    className={cn("px-2.5 py-1 rounded-md font-semibold transition-smooth",
                      sizingMode === "risk_percent" ? "bg-accent/20 text-accent-light" : "text-muted")}>
                    Risk %
                  </button>
                </div>
              </div>
              {sizingMode === "fixed_lots" ? (
                <Field label={`Lots (${currentRule?.minVolume ?? 0.01}–${currentRule?.maxVolume ?? 100})`}>
                  <input type="number" step="0.01" min="0.01" value={volume}
                    onChange={(e) => setVolume(e.target.value)} className="input font-mono" />
                </Field>
              ) : (
                <Field label="Risk % of account">
                  <input type="number" step="0.1" min="0.1" max="10" value={riskPct}
                    onChange={(e) => setRiskPct(e.target.value)} className="input font-mono" />
                  <div className="text-[10px] text-muted mt-1">SL is required — we derive lots from stop distance.</div>
                </Field>
              )}
            </div>

            {/* Entry / SL / TP */}
            <div className="grid sm:grid-cols-3 gap-3">
              {orderType !== "market" && (
                <Field label="Entry price">
                  <input type="number" step="0.00001" value={entry} onChange={(e) => setEntry(e.target.value)} className="input font-mono" />
                </Field>
              )}
              <Field label="Stop loss">
                <input type="number" step="0.00001" value={sl} onChange={(e) => setSl(e.target.value)} className="input font-mono" />
              </Field>
              <Field label="Take profit">
                <input type="number" step="0.00001" value={tp} onChange={(e) => setTp(e.target.value)} className="input font-mono" />
              </Field>
            </div>

            {/* Advanced */}
            <details className="group">
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.18em] text-muted hover:text-foreground transition-smooth flex items-center gap-2">
                <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                Advanced
              </summary>
              <div className="grid sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-border/50">
                {orderType === "market" && (
                  <Field label="Slippage (pips)">
                    <input type="number" value={slippage} onChange={(e) => setSlippage(e.target.value)} className="input font-mono" />
                  </Field>
                )}
                <Field label="Comment (optional)">
                  <input type="text" value={comment} maxLength={64} onChange={(e) => setComment(e.target.value)} className="input" placeholder="e.g. EU breakout 4H" />
                </Field>
              </div>
            </details>

            {/* Preview metrics */}
            {(entryRef > 0 || rr !== null) && (
              <div className="rounded-xl bg-surface-2/60 border border-border/50 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Metric label="Entry ref" value={entryRef ? entryRef.toFixed(currentRule?.digits ?? 2) : "—"} />
                <Metric label="Stop" value={sl || "—"} />
                <Metric label="Target" value={tp || "—"} />
                <Metric
                  label="R:R"
                  value={rr ? `${rr.toFixed(2)}R` : "—"}
                  tone={rr && rr >= 2 ? "bull" : rr && rr < 1 ? "bear" : undefined}
                />
              </div>
            )}

            {/* Errors / warnings */}
            {validation?.error && (
              <div className="text-xs text-bear-light bg-bear/5 border border-bear/30 rounded-lg p-3">
                {validation.error}
              </div>
            )}
            {validation?.warnings?.length ? (
              <div className="text-xs text-warn bg-warn/5 border border-warn/30 rounded-lg p-3 space-y-1">
                {validation.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            ) : null}

            {/* Actions */}
            {!confirmStage ? (
              <button
                onClick={async () => {
                  const v = await runValidate();
                  if (v?.ok) setConfirmStage(true);
                }}
                disabled={validating || !accountId}
                className={cn(
                  "w-full py-3.5 rounded-xl font-bold text-sm transition-smooth",
                  side === "buy"
                    ? "bg-bull/20 text-bull-light border border-bull/40 hover:bg-bull/30"
                    : "bg-bear/20 text-bear-light border border-bear/40 hover:bg-bear/30"
                )}
              >
                {validating ? "Validating…" : `Review ${side.toUpperCase()} order`}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-2">
                  <div className="text-[10px] font-bold tracking-[0.18em] text-accent-light uppercase">Confirm this order</div>
                  <div className="text-sm font-mono text-foreground">
                    {side.toUpperCase()} {volume} lots {symbol} ({orderType.toUpperCase()})
                    {selectedAccount && <span className="text-muted"> → #{selectedAccount.accountLogin}</span>}
                  </div>
                  {validation?.brokerSymbol && validation.brokerSymbol !== symbol && (
                    <div className="text-[11px] text-muted-light">Broker symbol: <span className="font-mono text-foreground">{validation.brokerSymbol}</span></div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setConfirmStage(false)} disabled={submitting} className="btn-secondary w-full">
                    ← Edit
                  </button>
                  <button onClick={submit} disabled={submitting} className="btn-primary w-full">
                    {submitting ? "Sending…" : "Send to broker"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Result */}
      {lastResult && <ExecutionResultView result={lastResult.result} requestId={lastResult.requestId} onDismiss={() => setLastResult(null)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted mb-0.5">{label}</div>
      <div className={cn("text-sm font-mono font-semibold",
        tone === "bull" ? "text-bull-light" : tone === "bear" ? "text-bear-light" : "text-foreground"
      )}>{value}</div>
    </div>
  );
}

function ExecutionResultView({
  result, requestId, onDismiss,
}: { result: ExecutionResult; requestId: string; onDismiss: () => void }) {
  const ok = result.executionStatus === "accepted" || result.executionStatus === "partial";
  const pending = result.executionStatus === "pending";
  const rejected = result.executionStatus === "rejected" || result.executionStatus === "error";

  return (
    <section className={cn(
      "glass-card p-6 space-y-4 border-2",
      ok ? "border-bull/40" : pending ? "border-warn/40" : "border-bear/40"
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shrink-0",
          ok ? "bg-bull/15 text-bull-light" : pending ? "bg-warn/15 text-warn" : "bg-bear/15 text-bear-light"
        )}>
          {ok ? "✓" : pending ? "⧗" : "✕"}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-fluid-lg font-semibold">
            {ok ? "Order accepted" : pending ? "Order queued" : "Order rejected"}
          </h3>
          <p className="text-fluid-sm text-muted-light mt-1">
            {ok && "Fill confirmed. Position is now active on your MT terminal."}
            {pending && "Order is queued — awaiting your MT bridge to pick it up and execute."}
            {rejected && (result.rejectionReason ?? "The broker adapter rejected this order.")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border/40">
        <Metric label="Ticket" value={result.brokerTicketRef ?? "—"} />
        <Metric label="Fill price" value={result.fillPrice != null ? String(result.fillPrice) : "—"} />
        <Metric label="Filled" value={result.filledVolume != null ? `${result.filledVolume} lots` : "—"} />
        <Metric label="Slippage" value={result.slippagePips != null ? `${result.slippagePips}p` : "—"} />
      </div>

      <div className="flex gap-2">
        <button onClick={onDismiss} className="btn-primary flex-1">Place another order</button>
        <Link href={`/dashboard/trading/executions/${requestId}`} className="btn-secondary flex-1 justify-center">View details</Link>
      </div>
    </section>
  );
}
