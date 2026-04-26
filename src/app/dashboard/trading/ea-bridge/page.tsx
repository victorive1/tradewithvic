"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getOrCreateUserKey } from "@/lib/trading/user-key-client";

interface Account {
  id: string;
  platformType: "MT4" | "MT5";
  brokerName: string;
  serverName: string;
  accountLogin: string;
  accountLabel: string | null;
  connectionStatus: string;
  adapterKind: string;
  lastConnectedAt: string | null;
  brokerSymbolSuffix?: string;
  brokerSymbolRenames?: string;
}

interface Endpoints {
  pull: string;
  ack: string;
  ping: string;
}

interface ProvisionResult {
  account: Account;
  webhookSecret: string;
  endpoints: Endpoints;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  return `${h}hr${h === 1 ? "" : "s"} ago`;
}

function CopyField({ label, value, mask }: { label: string; value: string; mask?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [reveal, setReveal] = useState(!mask);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* user will paste manually */ }
  }
  const display = mask && !reveal ? "•".repeat(Math.min(40, value.length)) : value;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
        <div className="flex gap-2">
          {mask && (
            <button onClick={() => setReveal((v) => !v)} className="text-[10px] text-accent-light hover:text-accent">
              {reveal ? "hide" : "reveal"}
            </button>
          )}
          <button onClick={copy} className="text-[10px] text-accent-light hover:text-accent">
            {copied ? "copied!" : "copy"}
          </button>
        </div>
      </div>
      <div className="font-mono text-xs bg-surface-2 border border-border rounded-lg px-3 py-2 break-all">
        {display}
      </div>
    </div>
  );
}

export default function EaBridgePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<Record<string, ProvisionResult>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const userKey = typeof window !== "undefined" ? getOrCreateUserKey() : "";

  const loadAccounts = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch("/api/trading/accounts", {
        headers: userKey ? { "x-trading-user-key": userKey } : undefined,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } catch (e) {
      setLoadErr((e as Error).message);
    }
    setLoading(false);
  }, [userKey]);

  useEffect(() => {
    loadAccounts();
    const id = window.setInterval(loadAccounts, 15_000);
    return () => window.clearInterval(id);
  }, [loadAccounts]);

  async function provision(account: Account, rotate: boolean) {
    setBusyId(account.id);
    try {
      const res = await fetch(`/api/trading/accounts/${account.id}/ea`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(userKey ? { "x-trading-user-key": userKey } : {}),
        },
        body: JSON.stringify({ rotate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `http_${res.status}`);
      setProvisioned((prev) => ({ ...prev, [account.id]: data }));
      loadAccounts();
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">MT4/MT5 EA Bridge</h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Route real orders from TradeWithVic into your MetaTrader terminal. Provision an
          account below, paste the secret into the EA, compile and attach, then turn on
          AutoTrading. The EA pulls pending orders every few seconds and reports fills back.
        </p>
      </div>

      <div className="glass-card p-4 flex items-center gap-4">
        <div className="text-2xl">📦</div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Download the EA</p>
          <p className="text-xs text-muted">
            Open in MetaEditor, compile, attach to a chart on the same account.
          </p>
        </div>
        <a
          href="/ea/TradeWithVicBridge.mq5"
          download
          className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent"
        >
          TradeWithVicBridge.mq5
        </a>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-sm text-muted">Loading accounts…</div>
      ) : loadErr ? (
        <div className="glass-card p-6 text-sm text-bear-light">Failed to load: {loadErr}</div>
      ) : accounts.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3">
          <div className="text-4xl">🧩</div>
          <p className="text-sm text-muted">
            No linked MT accounts yet.{" "}
            <Link href="/dashboard/trading-hub" className="text-accent-light hover:text-accent">
              Connect one in Trading Hub
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => {
            const p = provisioned[a.id];
            const isEa = a.adapterKind === "ea_webhook";
            const heartbeatFresh = a.lastConnectedAt
              ? Date.now() - new Date(a.lastConnectedAt).getTime() < 3 * 60 * 1000
              : false;
            return (
              <div key={a.id} className="glass-card p-5 space-y-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {a.accountLabel ?? `${a.brokerName} · ${a.accountLogin}`}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-2 border border-border/50 text-muted">
                        {a.platformType}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
                          isEa
                            ? "bg-accent/10 text-accent-light border-accent/30"
                            : "bg-surface-2 text-muted border-border/50",
                        )}
                      >
                        {isEa ? "EA Webhook" : a.adapterKind}
                      </span>
                      {isEa && (
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1.5",
                            heartbeatFresh
                              ? "bg-bull/10 text-bull-light border-bull/30"
                              : "bg-bear/10 text-bear-light border-bear/30",
                          )}
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              heartbeatFresh ? "bg-bull pulse-live" : "bg-bear",
                            )}
                          />
                          {heartbeatFresh ? "online" : "offline"} · last seen {fmtRelative(a.lastConnectedAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-1 font-mono">
                      {a.brokerName} · {a.serverName} · login {a.accountLogin}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!isEa && (
                      <button
                        onClick={() => provision(a, false)}
                        disabled={busyId === a.id}
                        className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold transition-smooth disabled:opacity-50"
                      >
                        {busyId === a.id ? "Provisioning…" : "Enable EA Bridge"}
                      </button>
                    )}
                    {isEa && (
                      <>
                        <button
                          onClick={() => provision(a, false)}
                          disabled={busyId === a.id}
                          className="px-3 py-2 rounded-xl bg-accent text-white text-xs font-semibold transition-smooth disabled:opacity-50"
                        >
                          {busyId === a.id ? "…" : "Show setup info"}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Rotate secret? The old EA secret will stop working.")) {
                              provision(a, true);
                            }
                          }}
                          disabled={busyId === a.id}
                          className="px-3 py-2 rounded-xl bg-warn/10 border border-warn/30 text-warn text-xs font-medium transition-smooth disabled:opacity-50"
                        >
                          {busyId === a.id ? "…" : "Rotate secret"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {p && (
                  <div className="space-y-3 pt-2 border-t border-border/40">
                    <div className="glass-card p-3 text-xs text-accent-light bg-accent/5 border border-accent/30">
                      ✓ EA Bridge ready. Paste the values below into the EA inputs in MT5.
                      Rotate the secret if you suspect it&apos;s been exposed.
                    </div>
                    <CopyField label="WebhookSecret (paste into EA)" value={p.webhookSecret} mask />
                    <CopyField label="AccountLogin" value={p.account.accountLogin} />
                    <CopyField label="ServerUrl (for EA input)" value={new URL(p.endpoints.pull).origin} />
                    {(a.brokerSymbolSuffix || (a.brokerSymbolRenames && a.brokerSymbolRenames !== "{}")) && (
                      <div className="text-xs text-muted bg-surface-2 p-3 rounded-lg">
                        <p className="font-semibold text-foreground mb-1">Broker symbol mapping (auto-applied)</p>
                        {a.brokerSymbolSuffix && (
                          <div>Suffix appended to every symbol: <code className="text-accent-light">{a.brokerSymbolSuffix}</code></div>
                        )}
                        {a.brokerSymbolRenames && a.brokerSymbolRenames !== "{}" && (
                          <div className="mt-1">Renames: <code className="text-accent-light">{a.brokerSymbolRenames}</code></div>
                        )}
                      </div>
                    )}
                    <details className="text-xs text-muted bg-surface-2 p-3 rounded-lg">
                      <summary className="cursor-pointer font-semibold text-foreground">Endpoints (advanced)</summary>
                      <div className="grid sm:grid-cols-3 gap-3 mt-3">
                        <CopyField label="Pull endpoint" value={p.endpoints.pull} />
                        <CopyField label="Ack endpoint" value={p.endpoints.ack} />
                        <CopyField label="Ping endpoint" value={p.endpoints.ping} />
                      </div>
                    </details>
                    <div className="text-xs text-muted bg-surface-2 p-3 rounded-lg space-y-2">
                      <p className="font-semibold text-foreground">MT5 setup steps for this account</p>
                      <ol className="list-decimal list-inside space-y-1 ml-1">
                        <li>
                          On your VPS, install (or copy) MT5 into a folder dedicated to this
                          account: <code className="text-accent-light">C:\{a.brokerName}_{a.accountLogin}</code>.
                          One MT5 instance can only be logged into one account at a time.
                        </li>
                        <li>Log into MT5 with login <code className="text-accent-light">{a.accountLogin}</code> on server <code className="text-accent-light">{a.serverName}</code>.</li>
                        <li>
                          Open MetaEditor (F4), open <code className="text-accent-light">TradeWithVicBridge.mq5</code>,
                          compile (F7).
                        </li>
                        <li>Drag the EA from Navigator onto any chart on this account.</li>
                        <li>
                          In the EA inputs, paste the <strong>WebhookSecret</strong> and the
                          <strong> AccountLogin</strong> shown above. Leave <strong>ServerUrl</strong> at
                          its default.
                        </li>
                        <li>
                          MT5 → Tools → Options → Expert Advisors → tick &quot;Allow WebRequest for
                          listed URL&quot; and add <code className="text-accent-light">{new URL(p.endpoints.pull).origin}</code>.
                        </li>
                        <li>Enable AutoTrading (Ctrl+E or the Algo Trading button).</li>
                      </ol>
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
