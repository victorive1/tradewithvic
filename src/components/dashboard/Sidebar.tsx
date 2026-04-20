"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import type { ProbeStatus } from "@/lib/agent/types";

// Sidebar href -> Agent engine id. Any nav item whose href isn't mapped
// here simply won't show a health dot. Algo pages are client-only
// consumers of /api/market/quotes, so they inherit Market Radar's status
// — if you ever give an algo its own persistent state, split it into a
// dedicated engine probe and remap here.
const ENGINE_BY_HREF: Record<string, string> = {
  "/dashboard": "market-radar",
  "/dashboard/market-direction": "market-direction",
  "/dashboard/screener": "market-prediction",
  "/dashboard/brain": "market-core-brain",
  "/dashboard/brain-execution": "brain-execution",
  "/dashboard/signal-channel": "signal-channel",
  "/dashboard/editors-pick": "editors-pick",
  // Algo Bots — all fetch /api/market/quotes directly, so they reflect
  // Market Radar health.
  "/dashboard/algo-hub": "market-radar",
  "/dashboard/fx-strength-algo": "market-radar",
  "/dashboard/ob-algo": "market-radar",
  "/dashboard/md-algo": "market-radar",
  "/dashboard/breakout-algo": "market-radar",
  "/dashboard/us30-algo": "market-radar",
  "/dashboard/metals-algo": "market-radar",
  "/dashboard/algo-vic": "market-radar",
  "/dashboard/custom-bot": "market-radar",
  "/dashboard/bot-agents": "market-radar",
};

function statusDotClass(status: ProbeStatus | undefined): string {
  return status === "healthy" ? "bg-bull shadow-[0_0_6px_rgba(16,185,129,0.5)]"
    : status === "warning" ? "bg-warn shadow-[0_0_6px_rgba(234,179,8,0.5)]"
    : status === "critical" ? "bg-bear shadow-[0_0_6px_rgba(244,63,94,0.6)] animate-pulse"
    : "bg-muted/50";
}

const navItems = [
  {
    section: "Home",
    items: [
      { label: "Market Core Brain", href: "/dashboard/brain", icon: "brain" },
      { label: "Market Core Brain Execution", href: "/dashboard/brain-execution", icon: "strength" },
      { label: "Agent", href: "/dashboard/agent", icon: "alerts" },
      { label: "My Dashboard", href: "/dashboard/my-dashboard", icon: "radar" },
      { label: "Market Radar", href: "/dashboard", icon: "screener" },
      { label: "Profile", href: "/dashboard/profile", icon: "watchlist" },
    ],
  },
  {
    section: "Markets",
    items: [
      { label: "Market Direction", href: "/dashboard/market-direction", icon: "setups" },
      { label: "Market Prediction", href: "/dashboard/screener", icon: "screener" },
      { label: "Currency Strength", href: "/dashboard/strength", icon: "strength" },
      { label: "Intelligence Chart", href: "/dashboard/intelligence-chart", icon: "radar" },
      { label: "Market Structure", href: "/dashboard/market-structure", icon: "levels" },
    ],
  },
  {
    section: "Signals",
    items: [
      { label: "Signal Channel", href: "/dashboard/signal-channel", icon: "alerts" },
      { label: "Editors Pick", href: "/dashboard/editors-pick", icon: "watchlist" },
      { label: "Trade Setups", href: "/dashboard/setups", icon: "setups" },
      { label: "Setup Pro", href: "/dashboard/setup-pro", icon: "setups" },
      { label: "Order Block Signals", href: "/dashboard/order-blocks", icon: "liquidity" },
      { label: "Breakout Signals", href: "/dashboard/breakouts", icon: "setups" },
      { label: "Custom Signal Builder", href: "/dashboard/custom-signals", icon: "screener" },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { label: "Institutional Flow", href: "/dashboard/institutional-flow", icon: "radar" },
      { label: "Sharp Money", href: "/dashboard/sharp-money", icon: "liquidity" },
      { label: "MTF Analyzer", href: "/dashboard/mtf", icon: "radar" },
      { label: "Volume Profile", href: "/dashboard/volume-profile", icon: "strength" },
      { label: "VWAP Engine", href: "/dashboard/vwap", icon: "strength" },
      { label: "Daily Brief", href: "/dashboard/brief", icon: "calendar" },
      { label: "Macro Heatmap", href: "/dashboard/macro", icon: "strength" },
      { label: "Central Banks", href: "/dashboard/central-banks", icon: "levels" },
      { label: "Trade Outcomes", href: "/dashboard/trade-outcomes", icon: "risk" },
      { label: "Capital Flow", href: "/dashboard/capital-flow", icon: "setups" },
      { label: "Signal Analytics", href: "/dashboard/signal-analytics", icon: "radar" },
    ],
  },
  {
    section: "Scanners",
    items: [
      { label: "Volatility", href: "/dashboard/volatility", icon: "alerts" },
      { label: "Engulfing", href: "/dashboard/engulfing", icon: "screener" },
      { label: "Correlation", href: "/dashboard/correlation", icon: "risk" },
    ],
  },
  {
    section: "Analysis",
    items: [
      { label: "Liquidity Map", href: "/dashboard/liquidity", icon: "liquidity" },
      { label: "Support/Resistance", href: "/dashboard/levels", icon: "levels" },
      { label: "Sentiment", href: "/dashboard/sentiment", icon: "sentiment" },
      { label: "Economic Calendar", href: "/dashboard/calendar", icon: "calendar" },
    ],
  },
  {
    section: "Community",
    items: [
      { label: "Community", href: "/dashboard/community", icon: "sentiment" },
    ],
  },
  {
    section: "Trading Hub",
    items: [
      { label: "Execute Trade", href: "/dashboard/trading/execute", icon: "setups" },
      { label: "Execution History", href: "/dashboard/trading/executions", icon: "screener" },
      { label: "Trading Hub", href: "/dashboard/trading-hub", icon: "setups" },
      { label: "MT5 Multi Account Hub", href: "/dashboard/mt5-hub", icon: "radar" },
      { label: "Multi MT5", href: "/dashboard/multi-mt5", icon: "radar" },
      { label: "Copy Trading", href: "/dashboard/copy-trading", icon: "strength" },
    ],
  },
  {
    section: "Algo Bots",
    items: [
      { label: "Algo Hub", href: "/dashboard/algo-hub", icon: "radar" },
      { label: "FX Strength Algo", href: "/dashboard/fx-strength-algo", icon: "setups" },
      { label: "Order Block Algo", href: "/dashboard/ob-algo", icon: "liquidity" },
      { label: "Market Direction Algo", href: "/dashboard/md-algo", icon: "screener" },
      { label: "Breakout Algo", href: "/dashboard/breakout-algo", icon: "setups" },
      { label: "US30 Algo", href: "/dashboard/us30-algo", icon: "radar" },
      { label: "Silver & Gold Algo", href: "/dashboard/metals-algo", icon: "strength" },
      { label: "Algo Vic (Scalper)", href: "/dashboard/algo-vic", icon: "screener" },
      { label: "Custom Bot Builder", href: "/dashboard/custom-bot", icon: "risk" },
      { label: "Bot Agents", href: "/dashboard/bot-agents", icon: "alerts" },
    ],
  },
  {
    section: "Management",
    items: [
      { label: "Algo Investors", href: "/dashboard/algo-investors", icon: "risk" },
      { label: "Day Evaluator", href: "/dashboard/evaluator", icon: "watchlist" },
      { label: "FX Commentary", href: "/dashboard/commentary", icon: "alerts" },
      { label: "Replay Mode", href: "/dashboard/replay", icon: "screener" },
    ],
  },
  {
    section: "Learn",
    items: [
      { label: "Free FX Course", href: "/dashboard/fx-course", icon: "watchlist" },
    ],
  },
  {
    section: "Tools",
    items: [
      { label: "Risk Calculator", href: "/dashboard/risk", icon: "risk" },
      { label: "Watchlist", href: "/dashboard/watchlist", icon: "watchlist" },
      { label: "Alerts", href: "/dashboard/alerts", icon: "alerts" },
      { label: "Settings", href: "/dashboard/settings", icon: "risk" },
      { label: "Billing & Plans", href: "/dashboard/billing", icon: "watchlist" },
      { label: "Payments", href: "/dashboard/payments", icon: "strength" },
      { label: "Admin Billing", href: "/dashboard/admin/billing", icon: "risk" },
    ],
  },
];

const iconMap: Record<string, React.ReactNode> = {
  brain: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3c-1.3 0-2.4.84-2.82 2H9a3 3 0 00-3 3v.18A3 3 0 003 11v1c0 1.3.84 2.4 2 2.82V15a3 3 0 003 3h.18A3 3 0 0011 21h2a3 3 0 002.82-2H16a3 3 0 003-3v-.18A3 3 0 0021 13v-1c0-1.3-.84-2.4-2-2.82V9a3 3 0 00-3-3h-.18A3 3 0 0013 3h-1zm0 3v12" /></svg>,
  radar: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  setups: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  strength: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>,
  screener: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>,
  liquidity: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  levels: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>,
  sentiment: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg>,
  calendar: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  risk: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.25-4.5h.008v.008H10.5v-.008zm0 2.25h.008v.008H10.5v-.008zm0 2.25h.008v.008H10.5v-.008zm2.25-4.5h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm2.25-4.5h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008z" /></svg>,
  watchlist: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>,
  alerts: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>,
};

function useEngineHealth() {
  const [engines, setEngines] = useState<Record<string, { status: ProbeStatus; statusMessage: string }>>({});
  const [overall, setOverall] = useState<ProbeStatus>("unknown");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/agent/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const next: Record<string, { status: ProbeStatus; statusMessage: string }> = {};
        for (const e of data.engines ?? []) next[e.id] = { status: e.status, statusMessage: e.statusMessage };
        setEngines(next);
        setOverall(data.overall ?? "unknown");
      } catch { /* silent — dots just won't show */ }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { engines, overall };
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { engines: engineHealth, overall: overallHealth } = useEngineHealth();

  return (
    <>
      <nav className="flex-1 overflow-y-auto p-3 space-y-5 relative">
        {navItems.map((section) => (
          <div key={section.section}>
            <p className="text-[10px] font-semibold text-muted/80 tracking-[0.18em] uppercase mb-2 px-3 pt-1">
              {section.section}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const engineId = ENGINE_BY_HREF[item.href];
                const health = engineId ? engineHealth[engineId] : undefined;
                // The Agent tab itself shows the overall rollup dot.
                const dotStatus: ProbeStatus | undefined = item.href === "/dashboard/agent"
                  ? overallHealth
                  : health?.status;
                const dotTitle = item.href === "/dashboard/agent"
                  ? `Overall system health: ${overallHealth}`
                  : health?.statusMessage;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-fluid-sm font-medium transition-smooth",
                      isActive
                        ? "text-foreground bg-gradient-to-r from-accent/15 via-accent/10 to-transparent border border-accent/25 shadow-[0_0_20px_var(--color-accent-glow)]"
                        : "text-muted-light hover:text-foreground hover:bg-surface-2/70"
                    )}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-accent-light to-accent"
                      />
                    )}
                    <span className={cn(
                      "transition-smooth shrink-0",
                      isActive ? "text-accent-light" : "text-muted group-hover:text-foreground"
                    )}>
                      {iconMap[item.icon]}
                    </span>
                    <span className="truncate flex-1">{item.label}</span>
                    {dotStatus && (
                      <span
                        aria-label={`health ${dotStatus}`}
                        title={dotTitle}
                        className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDotClass(dotStatus))}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-border/40 relative shrink-0">
        <Link
          href="/dashboard/profile"
          onClick={onNavigate}
          className="flex items-center gap-3 p-2 rounded-xl transition-smooth hover:bg-surface-2/70 border border-transparent hover:border-border/50"
        >
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent via-accent-light to-accent flex items-center justify-center text-white text-xs font-bold shadow-[0_4px_16px_var(--color-accent-glow)]">
              V
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-bull border-2 border-surface" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">Victor</p>
            <p className="text-[10px] text-muted truncate tracking-wider uppercase">Admin · Profile</p>
          </div>
        </Link>
      </div>
    </>
  );
}

export function DashboardSidebar() {
  return (
    <aside className="hidden lg:flex w-64 flex-col h-screen sticky top-0 relative isolate border-r border-border/60 shrink-0">
      {/* Ambient sidebar glow — subtle, cinematic */}
      <div className="absolute inset-0 -z-10 bg-surface" />
      <div className="absolute inset-0 -z-10 pointer-events-none opacity-60">
        <div className="orb w-[280px] h-[280px] bg-accent/20 -top-20 -left-20" />
        <div className="orb w-[200px] h-[200px] bg-bull/10 bottom-10 -left-10" />
      </div>

      <div className="p-5 border-b border-border/40 relative shrink-0">
        <Link href="/" className="inline-block transition-smooth hover:opacity-85">
          <Logo size="sm" />
        </Link>
      </div>

      <SidebarBody />
    </aside>
  );
}

/**
 * Mobile drawer — slides in from the left, triggered by the header hamburger.
 * Handles ESC key, backdrop click, and scroll lock.
 */
export function MobileSidebarDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          "lg:hidden fixed inset-0 z-50 bg-background/70 backdrop-blur-md transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "lg:hidden fixed top-0 left-0 bottom-0 z-[51] w-[84vw] max-w-[320px] flex flex-col border-r border-border/60 bg-surface shadow-[20px_0_60px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="absolute inset-0 -z-10 pointer-events-none opacity-60">
          <div className="orb w-[280px] h-[280px] bg-accent/20 -top-20 -left-20" />
          <div className="orb w-[200px] h-[200px] bg-bull/10 bottom-10 -left-10" />
        </div>

        <div className="p-4 border-b border-border/40 flex items-center justify-between shrink-0">
          <Link href="/" onClick={onClose} className="inline-block transition-smooth hover:opacity-85">
            <Logo size="sm" />
          </Link>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="w-9 h-9 rounded-xl bg-surface-2/60 border border-border hover:border-border-light hover:bg-surface-2 flex items-center justify-center transition-smooth text-muted hover:text-foreground"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <SidebarBody onNavigate={onClose} />
      </aside>
    </>
  );
}

export function MobileMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-label="Open navigation"
      className="lg:hidden w-10 h-10 rounded-xl bg-surface-2/60 border border-border hover:border-border-light hover:bg-surface-2 flex items-center justify-center transition-smooth text-muted hover:text-foreground"
    >
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}

/**
 * Hook that owns drawer open/close state. Used by Header + Layout.
 * Auto-closes when the route changes.
 */
export function useSidebarDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  return { open, setOpen };
}
