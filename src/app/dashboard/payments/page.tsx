"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { StripeCardForm } from "@/components/billing/StripeCardForm";

type Tab = "overview" | "deposit" | "withdraw" | "cards" | "crypto" | "history";

interface Account {
  id: string;
  currency: string;
  availableBalance: number;
  pendingBalance: number;
  lockedBalance: number;
}

interface Card {
  id: string;
  brand: string | null;
  last4: string | null;
  nickname: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  isDefault: boolean;
  processorName: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Transaction {
  id: string;
  transactionType: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  createdAt: string;
}

const USERKEY_STORAGE = "tradewithvic_billing_user_key";

function getOrCreateUserKey(): string {
  if (typeof window === "undefined") return "";
  let k = window.localStorage.getItem(USERKEY_STORAGE);
  if (!k) {
    k = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `uk_${Date.now()}`;
    window.localStorage.setItem(USERKEY_STORAGE, k);
  }
  return k;
}

function fmtUsd(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function BillingPaymentsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [userKey, setUserKey] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pending, setPending] = useState({ deposits: 0, withdrawals: 0 });
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-billing-user-key": userKey }), [userKey]);

  useEffect(() => { setUserKey(getOrCreateUserKey()); }, []);

  const fetchOverview = useCallback(async () => {
    if (!userKey) return;
    setLoading(true);
    try {
      const res = await fetch("/api/billing/overview", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAccount(data.account);
        setCards((data.paymentMethods ?? []).filter((p: any) => p.methodType === "card"));
        setTransactions(data.recentTransactions ?? []);
        setPending({ deposits: data.pendingDeposits ?? 0, withdrawals: data.pendingWithdrawals ?? 0 });
      }
    } finally { setLoading(false); }
  }, [userKey, headers]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const total = account ? account.availableBalance + account.pendingBalance + account.lockedBalance : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Billing & Payments</h1>
          <p className="text-sm text-muted mt-1">
            Deposits, withdrawals, cards, crypto methods, and full transaction history.
          </p>
        </div>
        <LiveBanner />
      </header>

      {statusMsg && <div className="glass-card p-3 text-sm text-bull-light border border-bull/30">{statusMsg}</div>}

      <section className="aurora-surface p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <BalanceTile label="Total Balance" value={fmtUsd(total)} highlight />
          <BalanceTile label="Available" value={fmtUsd(account?.availableBalance ?? 0)} subtle={account?.availableBalance === 0} />
          <BalanceTile label="Pending" value={fmtUsd(account?.pendingBalance ?? 0)} subtle={account?.pendingBalance === 0} />
          <BalanceTile label="Locked (in transit)" value={fmtUsd(account?.lockedBalance ?? 0)} subtle={account?.lockedBalance === 0} />
        </div>
        {(pending.deposits > 0 || pending.withdrawals > 0) && (
          <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-4 text-xs text-muted">
            {pending.deposits > 0 && <span>⏳ {pending.deposits} deposit{pending.deposits === 1 ? "" : "s"} pending</span>}
            {pending.withdrawals > 0 && <span>⏳ {pending.withdrawals} withdrawal{pending.withdrawals === 1 ? "" : "s"} under review</span>}
          </div>
        )}
      </section>

      <nav className="flex gap-1.5 flex-wrap">
        {([
          ["overview", "Overview"],
          ["deposit", "Deposit"],
          ["withdraw", "Withdraw"],
          ["cards", `Cards${cards.length > 0 ? ` (${cards.length})` : ""}`],
          ["crypto", "Crypto"],
          ["history", "History"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("px-4 py-1.5 rounded-full text-xs font-medium border transition-smooth",
              tab === id ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
            {label}
          </button>
        ))}
      </nav>

      {loading && <div className="glass-card p-12 text-center text-muted">Loading billing…</div>}

      {!loading && tab === "overview" && (
        <OverviewPanel transactions={transactions} cards={cards} onNavigate={setTab} />
      )}
      {!loading && tab === "deposit" && (
        <DepositPanel cards={cards} headers={headers} onComplete={(msg) => { setStatusMsg(msg); fetchOverview(); setTab("overview"); setTimeout(() => setStatusMsg(null), 6000); }} />
      )}
      {!loading && tab === "withdraw" && (
        <WithdrawPanel available={account?.availableBalance ?? 0} headers={headers} onComplete={(msg) => { setStatusMsg(msg); fetchOverview(); setTab("overview"); setTimeout(() => setStatusMsg(null), 6000); }} />
      )}
      {!loading && tab === "cards" && (
        <CardsPanel cards={cards} headers={headers} refresh={fetchOverview} />
      )}
      {!loading && tab === "crypto" && (
        <CryptoPanel headers={headers} onComplete={(msg) => { setStatusMsg(msg); fetchOverview(); setTab("overview"); setTimeout(() => setStatusMsg(null), 6000); }} />
      )}
      {!loading && tab === "history" && (
        <HistoryPanel headers={headers} />
      )}
    </div>
  );
}

function LiveBanner() {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-bull/40 bg-bull/10 text-bull-light text-[11px] font-semibold uppercase tracking-wider">
      <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />
      Live
    </span>
  );
}

function BalanceTile({ label, value, highlight, subtle }: { label: string; value: string; highlight?: boolean; subtle?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", highlight ? "border-accent/30 bg-accent/5" : "border-border/50 bg-surface/60")}>
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className={cn("text-2xl font-bold font-mono mt-1", subtle ? "text-muted" : highlight ? "gradient-text-accent" : "text-foreground")}>{value}</div>
    </div>
  );
}

function OverviewPanel({ transactions, cards, onNavigate }: { transactions: Transaction[]; cards: Card[]; onNavigate: (t: Tab) => void }) {
  const defaultCard = cards.find((c) => c.isDefault) ?? cards[0];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Quick Actions</h3>
        <div className="grid gap-2">
          <button onClick={() => onNavigate("deposit")} className="btn-primary w-full">💰 Deposit Funds</button>
          <button onClick={() => onNavigate("withdraw")} className="btn-secondary w-full">💸 Withdraw</button>
          <button onClick={() => onNavigate("cards")} className="btn-ghost w-full justify-start">🗃 Manage Cards</button>
          <button onClick={() => onNavigate("crypto")} className="btn-ghost w-full justify-start">₿ Pay with Crypto</button>
        </div>
      </section>

      <section className="glass-card p-5 lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Activity</h3>
          <button onClick={() => onNavigate("history")} className="text-xs text-accent-light hover:text-accent underline underline-offset-4">Full history →</button>
        </div>
        {transactions.length === 0 ? (
          <p className="text-xs text-muted py-6 text-center">No transactions yet. Deposit funds to get started.</p>
        ) : (
          <ul className="space-y-1">
            {transactions.slice(0, 6).map((t) => <TransactionRow key={t.id} t={t} />)}
          </ul>
        )}
      </section>

      {defaultCard && (
        <section className="glass-card p-5 lg:col-span-3">
          <h3 className="text-sm font-semibold mb-3">Default Payment Method</h3>
          <CardTile card={defaultCard} />
        </section>
      )}
    </div>
  );
}

function TransactionRow({ t }: { t: Transaction }) {
  const colorClass = t.amount > 0 ? "text-bull-light" : t.amount < 0 ? "text-bear-light" : "text-muted";
  const statusClass = t.status === "completed" ? "badge badge-bull"
    : t.status === "pending" ? "badge badge-warn"
      : t.status === "failed" ? "badge badge-bear"
        : "badge badge-neutral";
  return (
    <li className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 text-xs">
      <div className="flex items-center gap-3 min-w-0">
        <span className="uppercase text-[9px] tracking-wider text-muted w-16">{t.transactionType}</span>
        <span className="text-muted-light truncate">{t.description ?? "—"}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={statusClass}>{t.status}</span>
        <span className={cn("font-mono font-semibold min-w-[80px] text-right", colorClass)}>
          {t.amount > 0 ? "+" : ""}{fmtUsd(t.amount)}
        </span>
        <span className="text-muted text-[10px] w-16 text-right">{timeAgo(t.createdAt)}</span>
      </div>
    </li>
  );
}

function CardTile({ card }: { card: Card }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-accent/20 via-surface-2 to-surface-3 border border-accent/30 shadow-md">
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-accent/30 blur-3xl pointer-events-none" />
      <div className="flex justify-between items-start relative">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">{card.processorName} · {card.brand ?? "Card"}</div>
          <div className="text-xl font-mono mt-3">•••• •••• •••• {card.last4 ?? "0000"}</div>
          {card.nickname && <div className="text-xs text-muted mt-1">{card.nickname}</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {card.isDefault && <span className="badge badge-accent">DEFAULT</span>}
          <span className="text-[10px] text-muted font-mono">
            {card.expiryMonth?.toString().padStart(2, "0") ?? "MM"}/{card.expiryYear?.toString().slice(-2) ?? "YY"}
          </span>
        </div>
      </div>
    </div>
  );
}

function DepositPanel({ cards, headers, onComplete }: { cards: Card[]; headers: Record<string, string>; onComplete: (msg: string) => void }) {
  const [method, setMethod] = useState<"card" | "crypto">("card");
  const [amount, setAmount] = useState("100");
  const [stage, setStage] = useState<"pick" | "pay">("pick");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userKey = headers["x-billing-user-key"] ?? "";

  const amountNum = Number(amount);
  const fee = method === "crypto" ? Math.max(1, amountNum * 0.01) : Math.max(0.3, amountNum * 0.029);
  const net = amountNum - fee;

  async function startCrypto() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/billing/bitpay/invoice", {
        method: "POST", headers,
        body: JSON.stringify({ amount: amountNum, currency: "USD" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "bitpay_invoice_failed");
      const data = await res.json();
      if (data?.invoice?.url) {
        window.location.href = data.invoice.url;
        return;
      }
      throw new Error("no_invoice_url");
    } catch (e: any) { setError(e.message ?? "Something went wrong"); }
    finally { setSubmitting(false); }
  }

  return (
    <section className="glass-card p-6 space-y-5 max-w-xl mx-auto">
      <h2 className="text-lg font-semibold">Deposit Funds</h2>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setMethod("card"); setStage("pick"); }}
          className={cn("py-3 rounded-xl text-sm font-semibold border transition-smooth",
            method === "card" ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50")}>
          💳 Card · Stripe
        </button>
        <button onClick={() => { setMethod("crypto"); setStage("pick"); }}
          className={cn("py-3 rounded-xl text-sm font-semibold border transition-smooth",
            method === "crypto" ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50")}>
          ₿ Crypto · BitPay
        </button>
      </div>

      {stage === "pick" && (
        <>
          <div>
            <label className="text-xs text-muted mb-1.5 block uppercase tracking-wider">Amount (USD)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={10}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-xl font-mono"
              />
              <div className="flex gap-1">
                {[50, 100, 500, 1000].map((q) => (
                  <button key={q} onClick={() => setAmount(String(q))}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-surface-2 border border-border hover:border-accent">
                    ${q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-surface-2 p-4 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted">Gross amount</span><span className="font-mono">{fmtUsd(amountNum || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">{method === "card" ? "Stripe fee (~2.9% + $0.30)" : "BitPay network fee (~1%)"}</span><span className="font-mono">{fmtUsd(fee)}</span></div>
            <div className="flex justify-between pt-2 border-t border-border/50"><span className="font-semibold">Net credit</span><span className="font-mono font-bold gradient-text-accent">{fmtUsd(net)}</span></div>
          </div>

          {error && <div className="text-xs text-bear-light">{error}</div>}

          {method === "card" ? (
            <button onClick={() => { setError(null); setStage("pay"); }} disabled={!amountNum || amountNum < 10} className="btn-primary w-full">
              Continue to secure card entry →
            </button>
          ) : (
            <button onClick={startCrypto} disabled={submitting || !amountNum || amountNum < 10} className="btn-primary w-full">
              {submitting ? "Creating invoice…" : `Pay ${fmtUsd(amountNum || 0)} with crypto`}
            </button>
          )}

          <p className="text-[10px] text-muted text-center">
            Minimum $10. Card payments processed by Stripe — your PAN/CVV never touches our servers.
            Crypto payments processed by BitPay — pay from any BTC, ETH, USDC, USDT wallet.
          </p>
          {cards.length > 0 && method === "card" && (
            <p className="text-[10px] text-muted text-center">
              You can also save this card during checkout for faster future payments.
            </p>
          )}
        </>
      )}

      {stage === "pay" && method === "card" && (
        <div className="space-y-4">
          <button onClick={() => setStage("pick")} className="text-xs text-muted hover:text-foreground">← Back to amount</button>
          <div className="rounded-xl bg-surface-2 p-3 text-xs flex justify-between">
            <span className="text-muted">Charging</span>
            <span className="font-mono font-bold">{fmtUsd(amountNum)}</span>
          </div>
          <StripeCardForm
            userKey={userKey}
            amount={amountNum}
            savePaymentMethod
            onSuccess={() => onComplete(`✓ Card payment of ${fmtUsd(amountNum)} submitted — balance updates once Stripe confirms.`)}
            onError={(msg) => setError(msg)}
          />
          {error && <div className="text-xs text-bear-light">{error}</div>}
        </div>
      )}
    </section>
  );
}

function WithdrawPanel({ available, headers, onComplete }: { available: number; headers: Record<string, string>; onComplete: (msg: string) => void }) {
  const [amount, setAmount] = useState("0");
  const [destinationType, setDestinationType] = useState<"bank" | "crypto">("bank");
  const [destinationRef, setDestinationRef] = useState("");
  const [destinationLabel, setDestinationLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const fee = destinationType === "crypto" ? Math.max(1, amountNum * 0.005) : Math.max(0.25, amountNum * 0.01);
  const net = amountNum - fee;
  const insufficient = amountNum > available;

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/billing/withdrawals", {
        method: "POST", headers,
        body: JSON.stringify({ amount: amountNum, destinationType, destinationRef, destinationLabel }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "withdrawal_failed");
      onComplete(`✓ Withdrawal request for ${fmtUsd(amountNum)} queued for review.`);
    } catch (e: any) { setError(e.message ?? "Something went wrong"); }
    finally { setSubmitting(false); }
  }

  return (
    <section className="glass-card p-6 space-y-5 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Withdraw Funds</h2>
        <div className="text-xs text-muted">Available: <span className="font-mono text-foreground">{fmtUsd(available)}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setDestinationType("bank")}
          className={cn("py-3 rounded-xl text-sm font-semibold border transition-smooth",
            destinationType === "bank" ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50")}>
          🏦 Bank
        </button>
        <button onClick={() => setDestinationType("crypto")}
          className={cn("py-3 rounded-xl text-sm font-semibold border transition-smooth",
            destinationType === "crypto" ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50")}>
          ₿ Crypto wallet
        </button>
      </div>

      <div>
        <label className="text-xs text-muted mb-1.5 block uppercase tracking-wider">Amount</label>
        <input type="number" inputMode="decimal" min={0} max={available} step={1}
          value={amount} onChange={(e) => setAmount(e.target.value)}
          className={cn("w-full px-4 py-3 rounded-xl bg-surface-2 border text-xl font-mono focus:outline-none",
            insufficient ? "border-bear/50 focus:border-bear" : "border-border focus:border-accent")} />
      </div>

      <div>
        <label className="text-xs text-muted mb-1.5 block uppercase tracking-wider">
          {destinationType === "bank" ? "Bank account reference" : "Wallet address"}
        </label>
        <input type="text" value={destinationRef} onChange={(e) => setDestinationRef(e.target.value)}
          placeholder={destinationType === "bank" ? "IBAN / account number" : "bc1q..."}
          className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none font-mono text-sm" />
      </div>

      <div>
        <label className="text-xs text-muted mb-1.5 block uppercase tracking-wider">Label (optional)</label>
        <input type="text" value={destinationLabel} onChange={(e) => setDestinationLabel(e.target.value)}
          placeholder="Main bank, Ledger cold storage, etc."
          className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm" />
      </div>

      <div className="rounded-xl bg-surface-2 p-4 space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-muted">Requested</span><span className="font-mono">{fmtUsd(amountNum || 0)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Network / processor fee</span><span className="font-mono">{fmtUsd(fee)}</span></div>
        <div className="flex justify-between pt-2 border-t border-border/50"><span className="font-semibold">You receive</span><span className="font-mono font-bold">{fmtUsd(net)}</span></div>
      </div>

      {error && <div className="text-xs text-bear-light">{error}</div>}
      {insufficient && <div className="text-xs text-bear-light">Insufficient available balance.</div>}

      <button onClick={submit} disabled={submitting || !amountNum || amountNum <= 0 || insufficient || !destinationRef}
        className="btn-primary w-full">
        {submitting ? "Submitting…" : "Request withdrawal"}
      </button>
      <p className="text-[10px] text-muted text-center">Requests enter review. Funds move from Available → Locked until processed.</p>
    </section>
  );
}

function CardsPanel({ cards, headers, refresh }: { cards: Card[]; headers: Record<string, string>; refresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [nickname, setNickname] = useState("");
  const [brand, setBrand] = useState("visa");
  const [last4, setLast4] = useState("");
  const [expM, setExpM] = useState(12);
  const [expY, setExpY] = useState(new Date().getFullYear() + 3);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addCard() {
    setAdding(true); setErr(null);
    try {
      const res = await fetch("/api/billing/payment-methods/cards", {
        method: "POST", headers,
        body: JSON.stringify({
          processorTokenRef: `tok_sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          processorName: "sandbox",
          brand, last4, expiryMonth: expM, expiryYear: expY, nickname,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "add_failed");
      setShowAdd(false);
      setNickname(""); setLast4("");
      refresh();
    } catch (e: any) { setErr(e.message ?? "Add failed"); }
    finally { setAdding(false); }
  }

  async function remove(id: string) {
    if (!confirm("Remove this card?")) return;
    await fetch(`/api/billing/payment-methods/cards/${id}`, { method: "DELETE", headers });
    refresh();
  }

  async function makeDefault(id: string) {
    await fetch(`/api/billing/payment-methods/cards/${id}/default`, { method: "PATCH", headers });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Saved Cards</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-secondary text-xs">+ Add card</button>
      </div>

      {showAdd && (
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Add card (sandbox)</h3>
          <p className="text-[11px] text-muted">
            In production, your card data goes directly to the payment processor (Stripe Elements / Coinbase hosted). We only store the processor's token reference — never PAN or CVV.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname (optional)"
              className="px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm" />
            <select value={brand} onChange={(e) => setBrand(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm">
              <option value="visa">Visa</option>
              <option value="mastercard">Mastercard</option>
              <option value="amex">Amex</option>
              <option value="discover">Discover</option>
            </select>
            <input type="text" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} placeholder="Last 4"
              className="px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm font-mono" />
            <div className="flex gap-2">
              <input type="number" min={1} max={12} value={expM} onChange={(e) => setExpM(Number(e.target.value))}
                className="w-16 px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm font-mono" />
              <input type="number" min={new Date().getFullYear()} value={expY} onChange={(e) => setExpY(Number(e.target.value))}
                className="flex-1 px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm font-mono" />
            </div>
          </div>
          {err && <div className="text-xs text-bear-light">{err}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
            <button onClick={addCard} disabled={adding || !last4 || last4.length !== 4} className="btn-primary text-xs">
              {adding ? "Adding…" : "Save card"}
            </button>
          </div>
        </section>
      )}

      {cards.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">💳</div>
          <p className="text-sm text-muted">No saved cards yet. Add one to deposit instantly.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.id} className="relative">
              <CardTile card={c} />
              <div className="flex gap-2 mt-2 justify-end text-xs">
                {!c.isDefault && <button onClick={() => makeDefault(c.id)} className="btn-ghost">Set default</button>}
                <button onClick={() => remove(c.id)} className="btn-ghost text-bear-light">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CryptoPanel({ headers, onComplete: _onComplete }: { headers: Record<string, string>; onComplete: (msg: string) => void }) {
  const [amount, setAmount] = useState("250");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function mint() {
    setSubmitting(true); setErr(null);
    try {
      const res = await fetch("/api/billing/bitpay/invoice", {
        method: "POST", headers,
        body: JSON.stringify({ amount: Number(amount), currency: "USD" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "bitpay_invoice_failed");
      const data = await res.json();
      if (data?.invoice?.url) {
        window.location.href = data.invoice.url;
        return;
      }
      throw new Error("no_invoice_url");
    } catch (e: any) { setErr(e.message ?? "Failed"); }
    finally { setSubmitting(false); }
  }

  return (
    <section className="glass-card p-6 space-y-5 max-w-xl mx-auto">
      <h2 className="text-lg font-semibold">Pay with Crypto</h2>
      <p className="text-xs text-muted">
        We hand you off to BitPay's hosted checkout, where you pick the coin and wallet.
        Supported: BTC · ETH · USDC · USDT · LTC · DOGE · BCH · XRP. Your balance credits
        automatically once the network confirms.
      </p>
      <div>
        <label className="text-xs text-muted mb-1.5 block uppercase tracking-wider">Amount (USD)</label>
        <input type="number" inputMode="decimal" min={10} step={1} value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border text-xl font-mono" />
      </div>
      {err && <div className="text-xs text-bear-light">{err}</div>}
      <button onClick={mint} disabled={submitting || !Number(amount)} className="btn-primary w-full">
        {submitting ? "Creating invoice…" : `Pay ${fmtUsd(Number(amount) || 0)} via BitPay`}
      </button>
      <p className="text-[10px] text-muted text-center">
        You'll be redirected back to this page after payment. Funds show as pending until network confirmation.
      </p>
    </section>
  );
}

function HistoryPanel({ headers }: { headers: Record<string, string> }) {
  const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal" | "fee">("all");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === "all" ? "/api/billing/transactions" : `/api/billing/transactions?type=${filter}`;
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions ?? []);
      }
    } finally { setLoading(false); }
  }, [filter, headers]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <section className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Transaction History</h2>
        <div className="flex gap-1.5">
          {(["all", "deposit", "withdrawal", "fee"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-smooth",
                filter === f ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50")}>
              {f}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="py-6 text-center text-muted text-sm">Loading…</div>
      ) : transactions.length === 0 ? (
        <div className="py-10 text-center text-muted text-sm">No records match.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border/40">
                <th className="text-left py-2 pr-3">DATE</th>
                <th className="text-left px-2">TYPE</th>
                <th className="text-left px-2">DESCRIPTION</th>
                <th className="text-left px-2">STATUS</th>
                <th className="text-right px-2">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-border/20 last:border-0">
                  <td className="py-2 pr-3 font-mono text-muted">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="px-2 uppercase text-[10px] tracking-wider">{t.transactionType}</td>
                  <td className="px-2 text-muted-light max-w-[320px] truncate">{t.description ?? "—"}</td>
                  <td className="px-2">
                    <span className={cn(
                      "badge",
                      t.status === "completed" ? "badge-bull" : t.status === "pending" ? "badge-warn" : t.status === "failed" ? "badge-bear" : "badge-neutral"
                    )}>{t.status}</span>
                  </td>
                  <td className={cn("text-right px-2 font-mono font-semibold",
                    t.amount > 0 ? "text-bull-light" : t.amount < 0 ? "text-bear-light" : "text-muted")}>
                    {t.amount > 0 ? "+" : ""}{fmtUsd(t.amount)}
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
