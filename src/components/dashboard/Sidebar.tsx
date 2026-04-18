"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

const navItems = [
  {
    section: "Home",
    items: [
      { label: "Market Core Brain", href: "/dashboard/brain", icon: "brain" },
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
      { label: "Sharp Money", href: "/dashboard/sharp-money", icon: "liquidity" },
      { label: "MTF Analyzer", href: "/dashboard/mtf", icon: "radar" },
      { label: "Volume Profile", href: "/dashboard/volume-profile", icon: "strength" },
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
    section: "Trading Hub",
    items: [
      { label: "Trading Hub", href: "/dashboard/trading-hub", icon: "setups" },
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

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 flex-col bg-surface border-r border-border/50 h-screen sticky top-0">
      <div className="p-5 border-b border-border/50">
        <Link href="/">
          <Logo size="sm" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        {navItems.map((section) => (
          <div key={section.section}>
            <p className="text-xs text-muted uppercase tracking-wider mb-2 px-3">
              {section.section}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-smooth",
                      isActive
                        ? "bg-accent/10 text-accent-light border border-accent/20"
                        : "text-muted-light hover:text-foreground hover:bg-surface-2"
                    )}
                  >
                    {iconMap[item.icon]}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border/50">
        <Link href="/dashboard/profile" className="flex items-center gap-3 hover:opacity-80 transition-smooth">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-white text-xs font-bold">
            V
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Victor</p>
            <p className="text-xs text-muted truncate">Admin • Profile</p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
