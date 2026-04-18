"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "overview" | "review" | "settings" | "transactions" | "accounts" | "destinations" | "webhooks";

function fmt(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}$${abs}`;
}

function timeAgo(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AdminBillingPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [overview, setOverview] = useState<any>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [destinations, setDestinations] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const checkUnlock = useCallback(async () => {
    const res = await fetch("/api/admin/billing/overview", { cache: "no-store" });
    setUnlocked(res.ok);
  }, []);

  useEffect(() => { checkUnlock(); }, [checkUnlock]);

  useEffect(() => {
    if (!unlocked) return;
    async function load() {
      if (tab === "overview") {
        const res = await fetch("/api/admin/billing/overview", { cache: "no-store" });
        if (res.ok) setOverview(await res.json());
      } else if (tab === "review") {
        const res = await fetch("/api/admin/billing/withdrawals?status=under_review", { cache: "no-store" });
        if (res.ok) setWithdrawals((await res.json()).withdrawals ?? []);
      } else if (tab === "settings") {
        const res = await fetch("/api/admin/billing/settings", { cache: "no-store" });
        if (res.ok) setSettings((await res.json()).settings ?? []);
      } else if (tab === "transactions") {
        const res = await fetch("/api/admin/billing/transactions?take=200", { cache: "no-store" });
        if (res.ok) setTransactions((await res.json()).transactions ?? []);
      } else if (tab === "destinations") {
        const res = await fetch("/api/admin/billing/destinations", { cache: "no-store" });
        if (res.ok) setDestinations((await res.json()).destinations ?? []);
      } else if (tab === "accounts") {
        const res = await fetch("/api/admin/billing/overview", { cache: "no-store" });
        if (res.ok) setOverview(await res.json());
      } else if (tab === "webhooks") {
        const res = await fetch("/api/admin/billing/overview", { cache: "no-store" });
        if (res.ok) setOverview(await res.json());
      }
    }
    load();
  }, [tab, unlocked, refreshKey]);

  async function submitUnlock() {
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await fetch("/api/admin/billing/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "unlock_failed");
      }
      setTokenInput("");
      setUnlocked(true);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setUnlockError(e.message ?? "Unlock failed");
    } finally {
      setUnlocking(false);
    }
  }

  async function lockOut() {
    await fetch("/api/admin/billing/unlock", { method: "DELETE" });
    setUnlocked(false);
  }

  if (unlocked === null) return <div className="glass-card p-12 text-center text-muted">Checking admin access…</div>;

  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <section className="glass-card p-8 space-y-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔐</span>
            <div>
              <h1 className="text-lg font-bold">Admin Billing</h1>
              <p className="text-xs text-muted">Restricted area · operator-only</p>
            </div>
          </div>
          <p className="text-sm text-muted-light">
            Enter your admin token to unlock platform billing controls. Your token sets a 12-hour
            HttpOnly cookie, so you don't need to paste it on every request.
          </p>
          <div>
            <label className="text-xs text-muted mb-1.5 block uppercase tracking-wider">Admin token</label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitUnlock(); }}
              placeholder="ADMIN_REFRESH_SECRET"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none font-mono text-sm"
            />
          </div>
          {unlockError && <div className="text-xs text-bear-light">{unlockError}</div>}
          <button onClick={submitUnlock} disabled={unlocking || !tokenInput} className="btn-primary w-full">
            {unlocking ? "Unlocking…" : "Unlock admin console"}
          </button>
          <p className="text-[10px] text-muted italic">
            Same token as /dashboard/brain admin refresh. Stored as <code>ADMIN_REFRESH_SECRET</code> in Vercel env vars.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Admin Billing</h1>
          <span className="badge badge-accent">OPERATOR</span>
          <span className="badge badge-warn">SANDBOX</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRefreshKey((k) => k + 1)} className="btn-ghost text-xs">↻ Refresh</button>
          <button onClick={lockOut} className="btn-ghost text-xs text-bear-light">Lock out</button>
        </div>
      </header>

      <nav className="flex gap-1.5 flex-wrap">
        {([
          ["overview", "Overview"],
          ["review", "Review Queue"],
          ["settings", "Methods & Limits"],
          ["transactions", "All Transactions"],
          ["accounts", "User Accounts"],
          ["destinations", "Business Wallets"],
          ["webhooks", "Webhooks"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("px-3.5 py-1.5 rounded-full text-xs font-medium border transition-smooth",
              tab === id ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
            {label}
            {id === "review" && overview?.queues?.initiatedWithdrawals + overview?.queues?.underReviewWithdrawals > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-warn/20 text-warn text-[10px] font-bold">
                {(overview.queues.initiatedWithdrawals ?? 0) + (overview.queues.underReviewWithdrawals ?? 0)}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === "overview" && overview && <OverviewPanel overview={overview} />}
      {tab === "review" && <ReviewPanel withdrawals={withdrawals} refresh={() => setRefreshKey((k) => k + 1)} />}
      {tab === "settings" && <SettingsPanel settings={settings} refresh={() => setRefreshKey((k) => k + 1)} />}
      {tab === "transactions" && <TransactionsPanel transactions={transactions} />}
      {tab === "accounts" && overview && <AccountsPanel overview={overview} />}
      {tab === "destinations" && <DestinationsPanel destinations={destinations} refresh={() => setRefreshKey((k) => k + 1)} />}
      {tab === "webhooks" && overview && <WebhooksPanel webhooks={overview.recentWebhooks ?? []} />}
    </div>
  );
}

function OverviewPanel({ overview }: { overview: any }) {
  const p = overview.platform;
  const c = overview.cashflow;
  const q = overview.queues;
  return (
    <div className="space-y-6">
      <section className="aurora-surface p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-4">Platform Float</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile label="Total Held" value={fmt(p.totalHeld)} highlight />
          <Tile label="Available" value={fmt(p.totalAvailable)} />
          <Tile label="Pending" value={fmt(p.totalPending)} />
          <Tile label="Locked (review)" value={fmt(p.totalLocked)} tone={p.totalLocked > 0 ? "warn" : undefined} />
        </div>
        <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap items-center gap-5 text-xs text-muted">
          <span>{p.accountCount} accounts</span>
          <span className="text-bull-light">+{c.deposits24h} deposits / 24h</span>
          <span className="text-bear-light">-{c.withdrawals24h} withdrawals / 24h</span>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <section className="glass-card p-5 space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Lifetime Cashflow</h3>
          <Line label="Gross deposits" value={fmt(c.totalDepositsAmount)} count={c.totalDepositsCount} tone="bull" />
          <Line label="Gross withdrawals" value={fmt(c.totalWithdrawalsAmount)} count={c.totalWithdrawalsCount} tone="bear" />
          <Line label="Fee revenue" value={fmt(c.totalFeesAmount)} count={c.totalFeesCount} tone="accent" />
        </section>
        <section className="glass-card p-5 space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Review Queue</h3>
          <Line label="Under review" value={String(q.underReviewWithdrawals)} count={null} tone={q.underReviewWithdrawals > 0 ? "warn" : undefined} />
          <Line label="Initiated" value={String(q.initiatedWithdrawals)} count={null} tone={q.initiatedWithdrawals > 0 ? "warn" : undefined} />
          <Line label="Failed deposits (7d)" value={String(q.failedDeposits7d)} count={null} tone={q.failedDeposits7d > 0 ? "bear" : undefined} />
          <Line label="Failed withdrawals (7d)" value={String(q.failedWithdrawals7d)} count={null} tone={q.failedWithdrawals7d > 0 ? "bear" : undefined} />
        </section>
        <section className="glass-card p-5 space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Methods</h3>
          <Line label="Enabled" value={String(overview.settings.enabled)} count={null} tone="bull" />
          <Line label="Disabled" value={String(overview.settings.disabled)} count={null} tone={overview.settings.disabled > 0 ? "muted" : undefined} />
        </section>
      </div>

      <section className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Top Accounts by Available Balance</h3>
        {overview.accounts?.length === 0 ? (
          <p className="text-xs text-muted">No accounts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border/40">
                  <th className="text-left py-2 pr-3">USER KEY</th>
                  <th className="text-right px-2">AVAILABLE</th>
                  <th className="text-right px-2">PENDING</th>
                  <th className="text-right px-2">LOCKED</th>
                  <th className="text-right px-2">CREATED</th>
                </tr>
              </thead>
              <tbody>
                {overview.accounts.slice(0, 10).map((a: any) => (
                  <tr key={a.id} className="border-b border-border/20 last:border-0">
                    <td className="py-2 pr-3 font-mono text-muted-light">{a.userKey.slice(0, 16)}…</td>
                    <td className="text-right px-2 font-mono">{fmt(a.availableBalance)}</td>
                    <td className="text-right px-2 font-mono text-warn">{fmt(a.pendingBalance)}</td>
                    <td className="text-right px-2 font-mono text-muted">{fmt(a.lockedBalance)}</td>
                    <td className="text-right px-2 text-muted">{timeAgo(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, highlight, tone }: { label: string; value: string; highlight?: boolean; tone?: string }) {
  return (
    <div className={cn("rounded-xl border p-4",
      highlight ? "border-accent/30 bg-accent/5" : "border-border/50 bg-surface/60"
    )}>
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className={cn("text-2xl font-bold font-mono mt-1",
        tone === "warn" ? "text-warn" : tone === "bear" ? "text-bear-light" : highlight ? "gradient-text-accent" : "text-foreground"
      )}>{value}</div>
    </div>
  );
}

function Line({ label, value, count, tone }: { label: string; value: string; count: number | null; tone?: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn("font-mono font-semibold",
          tone === "bull" ? "text-bull-light" : tone === "bear" ? "text-bear-light" : tone === "warn" ? "text-warn" : tone === "accent" ? "text-accent-light" : ""
        )}>{value}</span>
        {count !== null && <span className="text-[10px] text-muted">×{count}</span>}
      </div>
    </div>
  );
}

function ReviewPanel({ withdrawals, refresh }: { withdrawals: any[]; refresh: () => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<Record<string, string | null>>({});

  async function decide(id: string, decision: "approve" | "reject" | "flag") {
    setWorking((w) => ({ ...w, [id]: decision }));
    try {
      await fetch(`/api/admin/billing/withdrawals/${id}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: notes[id] ?? null }),
      });
      refresh();
    } finally {
      setWorking((w) => ({ ...w, [id]: null }));
    }
  }

  if (withdrawals.length === 0) {
    return (
      <div className="glass-card p-12 text-center space-y-2">
        <div className="text-3xl">✓</div>
        <h3 className="text-base font-semibold">Queue clear</h3>
        <p className="text-sm text-muted">No withdrawals awaiting review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Each decision is immediate: <span className="text-bull-light">Approve</span> releases locked funds and settles the request;
        <span className="text-bear-light"> Reject</span> returns funds to the user's available balance and logs a refund;
        <span className="text-warn"> Flag</span> keeps the item in review with a note.
      </p>
      {withdrawals.map((w) => (
        <section key={w.id} className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold">{fmt(w.amount)}</span>
              <span className="badge badge-warn">{w.status}</span>
              <span className="text-xs text-muted">{w.destinationType}</span>
            </div>
            <span className="text-xs text-muted">{timeAgo(w.createdAt)}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <KV label="User Key" value={`${w.userKey.slice(0, 16)}…`} mono />
            <KV label="Destination Ref" value={w.destinationRef} mono />
            <KV label="Destination Label" value={w.destinationLabel ?? "—"} />
            <KV label="Fee / Net" value={`${fmt(w.feeAmount)} / ${fmt(w.netAmount ?? 0)}`} mono />
          </div>
          <textarea
            value={notes[w.id] ?? ""}
            onChange={(e) => setNotes({ ...notes, [w.id]: e.target.value })}
            placeholder="Decision note (optional — visible in audit log)"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => decide(w.id, "flag")} disabled={!!working[w.id]}
              className="px-3 py-1.5 rounded-lg bg-warn/10 text-warn border border-warn/30 text-xs font-semibold hover:bg-warn/15">
              {working[w.id] === "flag" ? "…" : "⚠ Flag"}
            </button>
            <button onClick={() => decide(w.id, "reject")} disabled={!!working[w.id]}
              className="px-3 py-1.5 rounded-lg bg-bear/10 text-bear-light border border-bear/30 text-xs font-semibold hover:bg-bear/15">
              {working[w.id] === "reject" ? "…" : "✕ Reject"}
            </button>
            <button onClick={() => decide(w.id, "approve")} disabled={!!working[w.id]}
              className="px-3 py-1.5 rounded-lg bg-bull/15 text-bull-light border border-bull/40 text-xs font-semibold hover:bg-bull/20">
              {working[w.id] === "approve" ? "…" : "✓ Approve"}
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted uppercase text-[10px] tracking-wider">{label}</div>
      <div className={cn("mt-0.5 truncate", mono && "font-mono")}>{value}</div>
    </div>
  );
}

function SettingsPanel({ settings, refresh }: { settings: any[]; refresh: () => void }) {
  const [draftMap, setDraftMap] = useState<Record<string, any>>({});

  useEffect(() => {
    const m: Record<string, any> = {};
    for (const s of settings) m[s.paymentMethodKey] = { ...s };
    setDraftMap(m);
  }, [settings]);

  function updateDraft(key: string, patch: any) {
    setDraftMap((m) => ({ ...m, [key]: { ...m[key], ...patch } }));
  }

  async function save(key: string) {
    const draft = draftMap[key];
    await fetch("/api/admin/billing/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethodKey: key,
        isEnabled: draft.isEnabled,
        minAmount: draft.minAmount,
        maxAmount: draft.maxAmount,
      }),
    });
    refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Enable or disable methods, set deposit/withdrawal bounds, and tune fees.
        Changes take effect on the next user request.
      </p>
      {settings.map((s) => {
        const d = draftMap[s.paymentMethodKey] ?? s;
        const dirty = d.isEnabled !== s.isEnabled || d.minAmount !== s.minAmount || d.maxAmount !== s.maxAmount;
        return (
          <section key={s.id} className="glass-card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold">{s.paymentMethodKey}</span>
                <span className={cn("badge", d.isEnabled ? "badge-bull" : "badge-neutral")}>{d.isEnabled ? "ENABLED" : "DISABLED"}</span>
              </div>
              <button onClick={() => updateDraft(s.paymentMethodKey, { isEnabled: !d.isEnabled })}
                className={cn("px-3 py-1 rounded-lg text-xs font-semibold border",
                  d.isEnabled ? "bg-bear/10 text-bear-light border-bear/30" : "bg-bull/10 text-bull-light border-bull/30")}>
                {d.isEnabled ? "Disable" : "Enable"}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <NumField label="Min amount (USD)" value={d.minAmount} onChange={(v) => updateDraft(s.paymentMethodKey, { minAmount: v })} />
              <NumField label="Max amount (USD)" value={d.maxAmount} onChange={(v) => updateDraft(s.paymentMethodKey, { maxAmount: v })} />
              <div className="flex items-end">
                <button onClick={() => save(s.paymentMethodKey)} disabled={!dirty} className="btn-primary text-xs w-full">
                  {dirty ? "Save" : "Saved"}
                </button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[10px] text-muted mb-1 block uppercase tracking-wider">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm font-mono" />
    </div>
  );
}

function TransactionsPanel({ transactions }: { transactions: any[] }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const filtered = typeFilter === "all" ? transactions : transactions.filter((t) => t.transactionType === typeFilter);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {["all", "deposit", "withdrawal", "fee", "refund", "adjustment"].map((f) => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-smooth",
              typeFilter === f ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50")}>
            {f}
          </button>
        ))}
      </div>
      <section className="glass-card overflow-x-auto p-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted border-b border-border/40 bg-surface-2/30">
              <th className="text-left py-2.5 px-3">DATE</th>
              <th className="text-left px-2">USER</th>
              <th className="text-left px-2">TYPE</th>
              <th className="text-left px-2">DESCRIPTION</th>
              <th className="text-left px-2">STATUS</th>
              <th className="text-right px-2">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted">No transactions.</td></tr>
            ) : filtered.map((t) => (
              <tr key={t.id} className="border-b border-border/20 last:border-0">
                <td className="py-2 px-3 font-mono text-muted">{new Date(t.createdAt).toLocaleString()}</td>
                <td className="px-2 font-mono text-muted-light">{t.userKey?.slice(0, 10)}…</td>
                <td className="px-2 uppercase text-[10px] tracking-wider">{t.transactionType}</td>
                <td className="px-2 text-muted-light max-w-[260px] truncate">{t.description ?? "—"}</td>
                <td className="px-2">
                  <span className={cn("badge",
                    t.status === "completed" ? "badge-bull" :
                    t.status === "pending" ? "badge-warn" :
                    t.status === "failed" ? "badge-bear" : "badge-neutral"
                  )}>{t.status}</span>
                </td>
                <td className={cn("text-right px-2 font-mono font-semibold",
                  t.amount > 0 ? "text-bull-light" : t.amount < 0 ? "text-bear-light" : "text-muted")}>
                  {t.amount > 0 ? "+" : ""}{fmt(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function AccountsPanel({ overview }: { overview: any }) {
  return (
    <section className="glass-card p-5">
      <h3 className="text-sm font-semibold mb-3">User Accounts (recent 10)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted border-b border-border/40">
              <th className="text-left py-2 pr-3">USER KEY</th>
              <th className="text-right px-2">AVAILABLE</th>
              <th className="text-right px-2">PENDING</th>
              <th className="text-right px-2">LOCKED</th>
              <th className="text-right px-2">CURRENCY</th>
              <th className="text-right px-2">CREATED</th>
            </tr>
          </thead>
          <tbody>
            {overview.accounts.map((a: any) => (
              <tr key={a.id} className="border-b border-border/20 last:border-0">
                <td className="py-2 pr-3 font-mono text-muted-light">{a.userKey}</td>
                <td className="text-right px-2 font-mono">{fmt(a.availableBalance)}</td>
                <td className="text-right px-2 font-mono text-warn">{fmt(a.pendingBalance)}</td>
                <td className="text-right px-2 font-mono text-muted">{fmt(a.lockedBalance)}</td>
                <td className="text-right px-2 text-muted">{a.currency}</td>
                <td className="text-right px-2 text-muted">{timeAgo(a.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DestinationsPanel({ destinations, refresh }: { destinations: any[]; refresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [currency, setCurrency] = useState("BTC");
  const [walletAddress, setWalletAddress] = useState("");
  const [network, setNetwork] = useState("bitcoin");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      await fetch("/api/admin/billing/destinations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currencyCode: currency,
          destinationType: "wallet_address",
          walletAddressRef: walletAddress,
          network,
          nickname,
        }),
      });
      setShowAdd(false); setWalletAddress(""); setNickname("");
      refresh();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Deactivate this business wallet?")) return;
    await fetch(`/api/admin/billing/destinations?id=${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">Business crypto wallets that receive platform deposits.</p>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-secondary text-xs">+ Link wallet</button>
      </div>
      {showAdd && (
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Link business wallet</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted mb-1 block uppercase tracking-wider">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm">
                <option value="BTC">BTC</option><option value="ETH">ETH</option><option value="USDC">USDC</option><option value="USDT">USDT</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted mb-1 block uppercase tracking-wider">Network</label>
              <input value={network} onChange={(e) => setNetwork(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm font-mono" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-muted mb-1 block uppercase tracking-wider">Wallet address</label>
              <input value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm font-mono" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-muted mb-1 block uppercase tracking-wider">Nickname</label>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Treasury cold wallet, hot wallet…"
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
            <button onClick={create} disabled={saving || !walletAddress} className="btn-primary text-xs">
              {saving ? "Saving…" : "Link wallet"}
            </button>
          </div>
        </section>
      )}
      {destinations.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-muted">No business wallets linked yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {destinations.map((d) => (
            <section key={d.id} className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="badge badge-accent">{d.currencyCode}</span>
                  {d.isDefault && <span className="badge badge-bull">DEFAULT</span>}
                  {d.nickname && <span className="text-xs text-muted-light">{d.nickname}</span>}
                </div>
                <button onClick={() => remove(d.id)} className="text-xs text-bear-light hover:text-bear">Deactivate</button>
              </div>
              <div className="text-[11px] text-muted uppercase tracking-wider">Network</div>
              <div className="text-xs font-mono">{d.network ?? "—"}</div>
              <div className="mt-2 text-[11px] text-muted uppercase tracking-wider">Address</div>
              <div className="text-xs font-mono break-all">{d.walletAddressRef ?? d.processorAccountRef ?? "—"}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhooksPanel({ webhooks }: { webhooks: any[] }) {
  return (
    <section className="glass-card p-5">
      <h3 className="text-sm font-semibold mb-3">Recent Webhook Events</h3>
      {webhooks.length === 0 ? (
        <p className="text-xs text-muted py-6 text-center">No webhook events received yet. Processor wiring lands in Phase 2.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border/40">
                <th className="text-left py-2 pr-3">RECEIVED</th>
                <th className="text-left px-2">PROVIDER</th>
                <th className="text-left px-2">EVENT TYPE</th>
                <th className="text-left px-2">REF</th>
                <th className="text-left px-2">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id} className="border-b border-border/20 last:border-0">
                  <td className="py-2 pr-3 font-mono text-muted">{timeAgo(w.receivedAt)}</td>
                  <td className="px-2">{w.providerName}</td>
                  <td className="px-2 text-muted-light">{w.eventType}</td>
                  <td className="px-2 font-mono text-muted text-[10px]">{w.eventRef?.slice(0, 24)}…</td>
                  <td className="px-2">
                    <span className={cn("badge",
                      w.processingStatus === "processed" ? "badge-bull" :
                      w.processingStatus === "failed" ? "badge-bear" :
                      w.processingStatus === "pending" ? "badge-warn" : "badge-neutral"
                    )}>{w.processingStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
