"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type BillingView = "plans" | "subscription" | "invoices" | "payment";

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: "monthly" | "yearly";
  yearlyPrice?: number;
  features: string[];
  highlighted: boolean;
  badge?: string;
  tier: "free" | "starter" | "pro" | "elite";
}

interface Subscription {
  planId: string;
  status: "active" | "trial" | "past_due" | "cancelled" | "paused";
  startedAt: string;
  renewsAt: string;
  cancelledAt?: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  plan: string;
}

const PLANS: Plan[] = [
  {
    id: "free", name: "Free", price: 0, interval: "monthly", tier: "free", highlighted: false,
    features: ["Market Radar (limited)", "3 instruments", "Basic candlestick education", "FX Course access", "Community chat"],
  },
  {
    id: "starter", name: "Starter", price: 29, interval: "monthly", yearlyPrice: 290, tier: "starter", highlighted: false, badge: "Popular",
    features: ["Everything in Free", "All 22 instruments", "Trade Setups (A/B grade)", "Currency Strength", "Volatility Scanner", "S/R Engine", "Market Screener", "5 custom alert rules", "Email support"],
  },
  {
    id: "pro", name: "Pro", price: 79, interval: "monthly", yearlyPrice: 790, tier: "pro", highlighted: true, badge: "Best Value",
    features: ["Everything in Starter", "A+ Trade Setups", "Setup Pro with charts", "Signal Channel (13 strategies)", "Sharp Money Radar", "Capital Flow Engine", "Sentiment Engine", "Correlation Engine", "MTF Structure Engine", "Unlimited alert rules", "Custom Signal Builder", "Replay Mode", "Trading Hub (MT4/MT5)", "Signal Analytics", "Priority support"],
  },
  {
    id: "elite", name: "Elite", price: 199, interval: "monthly", yearlyPrice: 1990, tier: "elite", highlighted: false, badge: "For Pros",
    features: ["Everything in Pro", "All Algo Bots", "Algo Trading Vic", "Custom Bot Builder", "Bot Agents (supervisor)", "Copy Trading", "Algo Investors", "Multi MT5 Interface", "FX Commentary", "Trading Day Evaluator", "API access", "Dedicated account manager", "White-glove onboarding"],
  },
];

function loadSubscription(): Subscription | null {
  if (typeof window === "undefined") return null;
  try { const s = localStorage.getItem("subscription"); return s ? JSON.parse(s) : null; } catch { return null; }
}

function loadInvoices(): Invoice[] {
  if (typeof window === "undefined") return [];
  try { const s = localStorage.getItem("invoices"); return s ? JSON.parse(s) : []; } catch { return []; }
}

export default function BillingPage() {
  const [view, setView] = useState<BillingView>("plans");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);

  useEffect(() => {
    setSubscription(loadSubscription());
    setInvoices(loadInvoices());
  }, []);

  const currentPlan = subscription ? PLANS.find((p) => p.id === subscription.planId) : PLANS[0];

  function subscribe(planId: string) {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan || plan.price === 0) return;

    const sub: Subscription = {
      planId, status: "active",
      startedAt: new Date().toISOString(),
      renewsAt: new Date(Date.now() + (billingCycle === "yearly" ? 365 : 30) * 24 * 3600000).toISOString(),
    };
    setSubscription(sub);
    localStorage.setItem("subscription", JSON.stringify(sub));

    const invoice: Invoice = {
      id: `inv_${Date.now()}`,
      date: new Date().toISOString(),
      amount: billingCycle === "yearly" ? (plan.yearlyPrice || plan.price * 12) : plan.price,
      status: "paid",
      plan: plan.name,
    };
    const updatedInvoices = [invoice, ...invoices];
    setInvoices(updatedInvoices);
    localStorage.setItem("invoices", JSON.stringify(updatedInvoices));

    setView("subscription");
    alert(`Welcome to ${plan.name}! Your subscription is now active.`);
  }

  function cancelSubscription() {
    if (!confirm("Are you sure you want to cancel? You'll keep access until the end of your billing period.")) return;
    if (subscription) {
      const updated = { ...subscription, status: "cancelled" as const, cancelledAt: new Date().toISOString() };
      setSubscription(updated);
      localStorage.setItem("subscription", JSON.stringify(updated));
    }
  }

  function pauseSubscription() {
    if (subscription) {
      const updated = { ...subscription, status: "paused" as const };
      setSubscription(updated);
      localStorage.setItem("subscription", JSON.stringify(updated));
    }
  }

  function resumeSubscription() {
    if (subscription) {
      const updated = { ...subscription, status: "active" as const };
      setSubscription(updated);
      localStorage.setItem("subscription", JSON.stringify(updated));
    }
  }

  function applyPromo() {
    if (promoCode.trim().toLowerCase() === "tradewithvic20") {
      setPromoApplied(true);
      alert("Promo code applied! 20% discount on your first payment.");
    } else {
      alert("Invalid promo code.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing & Plans</h1>
        <p className="text-sm text-muted mt-1">Manage your subscription, view invoices, and choose the plan that fits your trading</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id: "plans" as BillingView, l: "Plans" },
          { id: "subscription" as BillingView, l: "My Subscription" },
          { id: "invoices" as BillingView, l: `Invoices (${invoices.length})` },
          { id: "payment" as BillingView, l: "Payment Methods" },
        ].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{v.l}</button>
        ))}
      </div>

      {/* PLANS */}
      {view === "plans" && (
        <div className="space-y-6">
          {/* Billing cycle toggle */}
          <div className="flex items-center justify-center gap-3">
            <span className={cn("text-sm", billingCycle === "monthly" ? "text-foreground font-medium" : "text-muted")}>Monthly</span>
            <button onClick={() => setBillingCycle(billingCycle === "monthly" ? "yearly" : "monthly")}
              className={cn("w-12 h-6 rounded-full relative transition-smooth", billingCycle === "yearly" ? "bg-accent" : "bg-surface-3")}>
              <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-smooth", billingCycle === "yearly" ? "left-7" : "left-1")} />
            </button>
            <span className={cn("text-sm", billingCycle === "yearly" ? "text-foreground font-medium" : "text-muted")}>Yearly</span>
            {billingCycle === "yearly" && <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20">Save ~17%</span>}
          </div>

          {/* Promo code */}
          <div className="flex items-center justify-center gap-2">
            <input type="text" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="Promo code" className="px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground w-40" />
            <button onClick={applyPromo} className="px-3 py-2 rounded-lg bg-surface-2 text-accent-light text-xs border border-border/50 hover:border-accent transition-smooth">Apply</button>
            {promoApplied && <span className="text-xs text-bull-light">✓ 20% off applied</span>}
          </div>

          {/* Plan cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan) => {
              const price = billingCycle === "yearly" && plan.yearlyPrice ? plan.yearlyPrice : plan.price;
              const monthlyEquiv = billingCycle === "yearly" && plan.yearlyPrice ? Math.round(plan.yearlyPrice / 12) : plan.price;
              const discountedPrice = promoApplied && plan.price > 0 ? Math.round(price * 0.8) : price;
              const isCurrent = currentPlan?.id === plan.id;

              return (
                <div key={plan.id} className={cn("glass-card p-6 relative", plan.highlighted ? "border-2 border-accent glow-accent" : "", isCurrent ? "border-2 border-bull" : "")}>
                  {plan.badge && <span className={cn("absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-0.5 rounded-full", plan.highlighted ? "bg-accent text-white" : "bg-surface-3 text-muted")}>{plan.badge}</span>}
                  {isCurrent && <span className="absolute -top-2.5 right-4 text-[10px] font-bold px-3 py-0.5 rounded-full bg-bull text-white">Current</span>}

                  <h3 className="text-lg font-bold text-foreground mb-1">{plan.name}</h3>
                  <div className="mb-4">
                    {plan.price === 0 ? (
                      <span className="text-3xl font-black text-foreground">Free</span>
                    ) : (
                      <>
                        <span className="text-3xl font-black text-foreground">${promoApplied ? discountedPrice : (billingCycle === "yearly" ? monthlyEquiv : price)}</span>
                        <span className="text-sm text-muted">/mo</span>
                        {billingCycle === "yearly" && plan.yearlyPrice && (
                          <div className="text-xs text-muted mt-0.5">${discountedPrice}/year billed annually</div>
                        )}
                        {promoApplied && plan.price > 0 && <div className="text-xs text-bull-light">20% off first payment</div>}
                      </>
                    )}
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-xs text-muted-light">
                        <svg className="w-4 h-4 text-bull-light flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        {feat}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <button disabled className="w-full py-3 rounded-xl bg-bull/20 text-bull-light text-sm font-medium">Current Plan</button>
                  ) : plan.price === 0 ? (
                    <button disabled className="w-full py-3 rounded-xl bg-surface-3 text-muted text-sm">Free Forever</button>
                  ) : (
                    <button onClick={() => subscribe(plan.id)}
                      className={cn("w-full py-3 rounded-xl text-sm font-semibold transition-smooth", plan.highlighted ? "bg-accent text-white glow-accent hover:bg-accent-light" : "bg-surface-2 text-foreground border border-border/50 hover:border-accent")}>
                      {subscription ? "Switch Plan" : "Get Started"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBSCRIPTION */}
      {view === "subscription" && (
        <div className="max-w-2xl space-y-4">
          {subscription && currentPlan ? (
            <>
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{currentPlan.name} Plan</h3>
                    <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full border capitalize",
                      subscription.status === "active" ? "bg-bull/10 text-bull-light border-bull/20" :
                      subscription.status === "trial" ? "bg-accent/10 text-accent-light border-accent/20" :
                      subscription.status === "paused" ? "bg-warn/10 text-warn border-warn/20" :
                      "bg-bear/10 text-bear-light border-bear/20")}>{subscription.status}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-foreground">${currentPlan.price}<span className="text-sm text-muted font-normal">/mo</span></div>
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted">Started</span><span className="text-foreground">{new Date(subscription.startedAt).toLocaleDateString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted">{subscription.status === "cancelled" ? "Access until" : "Renews"}</span><span className="text-foreground">{new Date(subscription.renewsAt).toLocaleDateString()}</span></div>
                  {subscription.cancelledAt && <div className="flex justify-between"><span className="text-muted">Cancelled</span><span className="text-bear-light">{new Date(subscription.cancelledAt).toLocaleDateString()}</span></div>}
                </div>
              </div>

              <div className="glass-card p-5">
                <h4 className="text-sm font-semibold mb-3">Plan Features</h4>
                <ul className="grid sm:grid-cols-2 gap-2">
                  {currentPlan.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-xs text-muted-light">
                      <svg className="w-3.5 h-3.5 text-bull-light flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={() => setView("plans")} className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium transition-smooth">Change Plan</button>
                {subscription.status === "active" && (
                  <button onClick={pauseSubscription} className="px-5 py-2.5 rounded-xl bg-warn/10 text-warn border border-warn/20 text-sm transition-smooth">Pause Subscription</button>
                )}
                {subscription.status === "paused" && (
                  <button onClick={resumeSubscription} className="px-5 py-2.5 rounded-xl bg-bull/10 text-bull-light border border-bull/20 text-sm transition-smooth">Resume Subscription</button>
                )}
                {subscription.status !== "cancelled" && (
                  <button onClick={cancelSubscription} className="px-5 py-2.5 rounded-xl bg-bear/10 text-bear-light border border-bear/20 text-sm transition-smooth">Cancel</button>
                )}
              </div>
            </>
          ) : (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">📋</div>
              <h3 className="text-lg font-semibold mb-2">No Active Subscription</h3>
              <p className="text-sm text-muted mb-4">You&apos;re currently on the Free plan. Upgrade to unlock premium features.</p>
              <button onClick={() => setView("plans")} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium glow-accent">View Plans</button>
            </div>
          )}
        </div>
      )}

      {/* INVOICES */}
      {view === "invoices" && (
        <div className="space-y-4">
          {invoices.length > 0 ? (
            <div className="glass-card overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-border/50">
                  <th className="text-left text-[10px] text-muted font-medium px-4 py-3">Date</th>
                  <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Plan</th>
                  <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Amount</th>
                  <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Status</th>
                  <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Invoice</th>
                </tr></thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/20">
                      <td className="px-4 py-3 text-xs">{new Date(inv.date).toLocaleDateString()}</td>
                      <td className="px-3 py-3 text-xs font-medium">{inv.plan}</td>
                      <td className="px-3 py-3 text-xs font-mono font-bold">${inv.amount}</td>
                      <td className="px-3 py-3"><span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize",
                        inv.status === "paid" ? "bg-bull/10 text-bull-light border-bull/20" : inv.status === "pending" ? "bg-warn/10 text-warn border-warn/20" : "bg-bear/10 text-bear-light border-bear/20")}>{inv.status}</span></td>
                      <td className="px-3 py-3"><button className="text-xs text-accent-light hover:text-accent">Download</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No invoices yet. Subscribe to a plan to see billing history.</p></div>
          )}
        </div>
      )}

      {/* PAYMENT METHODS */}
      {view === "payment" && (
        <div className="max-w-lg space-y-4">
          <div className="glass-card p-12 text-center">
            <div className="text-4xl mb-3">💳</div>
            <h3 className="text-lg font-semibold mb-2">No Payment Method</h3>
            <p className="text-sm text-muted mb-4">Add a payment method when you subscribe to a paid plan. We support credit/debit cards via Stripe.</p>
            <button onClick={() => setView("plans")} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium">View Plans</button>
          </div>
          <div className="glass-card p-5">
            <h4 className="text-sm font-semibold mb-2">Security</h4>
            <p className="text-xs text-muted leading-relaxed">Payment processing is handled securely by Stripe. TradeWithVic never stores your full card details. All transactions are encrypted and PCI-DSS compliant.</p>
          </div>
        </div>
      )}
    </div>
  );
}
