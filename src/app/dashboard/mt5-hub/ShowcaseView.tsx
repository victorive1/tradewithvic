"use client";

import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Mt5Account {
  id: string;
  platform: "MT4" | "MT5";
  login: string;
  server: string;
  broker: string;
  label?: string;
  connectedAt: string;
}

interface HubGroup {
  id: string;
  name: string;
  colorKey: string;
}

interface Props {
  accounts: Mt5Account[];
  groups: HubGroup[];
  meta: Record<string, { groupId: string | null; favorite: boolean; hubLabel?: string }>;
  summary: {
    total: number;
    platforms: { MT4: number; MT5: number };
    types: { live: number; demo: number; other: number };
    brokers: number;
    favorites: number;
  };
}

export function Mt5HubShowcase({ accounts, groups, meta, summary }: Props) {
  const accountKey = (a: Mt5Account) => `${a.login}:${a.server}`;

  const ringAccounts = useMemo(() => accounts.slice(0, 12), [accounts]);
  const focusAccount = useMemo(() => {
    const fav = accounts.find((a) => meta[accountKey(a)]?.favorite);
    return fav ?? accounts[0] ?? null;
  }, [accounts, meta]);

  const [autoIndex, setAutoIndex] = useState(0);
  useEffect(() => {
    if (accounts.length <= 1) return;
    const iv = setInterval(() => setAutoIndex((i) => i + 1), 5000);
    return () => clearInterval(iv);
  }, [accounts.length]);

  const displayed = focusAccount ?? (accounts.length > 0 ? accounts[autoIndex % accounts.length] : null);

  if (accounts.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-black/60 via-surface to-black/40 p-12 min-h-[520px] flex flex-col items-center justify-center gap-4 text-center">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          animate={{ opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-accent/25 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-bull/20 blur-3xl" />
        </motion.div>
        <div className="relative z-10 text-6xl mb-2">🧩</div>
        <div className="relative z-10 text-2xl font-bold">No accounts yet</div>
        <p className="relative z-10 text-sm text-muted max-w-md">
          Connect your first MT4 / MT5 account in Trading Hub. The Showcase will animate to life once at least one account is linked.
        </p>
        <Link href="/dashboard/trading-hub" className="relative z-10 mt-3 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold glow-accent">Connect Account →</Link>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-black/60 via-surface to-black/40 p-6 md:p-10 min-h-[640px]">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-bull/20 blur-3xl" />
      </motion.div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <motion.span className="h-2.5 w-2.5 rounded-full bg-bull"
              animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }} />
            <div className="text-xs uppercase tracking-[0.2em] text-muted">MT5 Multi Account Hub · Live</div>
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border/60 bg-gradient-to-br from-accent/10 via-transparent to-transparent p-6 backdrop-blur-sm">
            <div className="text-[11px] uppercase tracking-wider text-muted">Portfolio</div>
            <div className="text-4xl font-black tracking-tight mt-2 text-foreground">{summary.total}</div>
            <div className="text-xs mt-1 font-mono text-muted">accounts connected</div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <SummaryTile label="Live" value={summary.types.live} valueClass="text-bull-light" />
              <SummaryTile label="Demo" value={summary.types.demo} valueClass="text-accent-light" />
              <SummaryTile label="MT5" value={summary.platforms.MT5} />
              <SummaryTile label="MT4" value={summary.platforms.MT4} />
              <SummaryTile label="Brokers" value={summary.brokers} />
              <SummaryTile label="Starred" value={summary.favorites} valueClass="text-warn" />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl border border-border/40 bg-black/30 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Groups</div>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <span key={g.id} className="text-[11px] px-2 py-0.5 rounded-full border border-border/50 bg-surface-2/40">
                  {g.name}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="lg:col-span-2 flex flex-col items-center justify-center relative min-h-[540px]">
          <AccountOrbitRing accounts={ringAccounts} focusLogin={displayed?.login ?? null} />

          <motion.div
            key={displayed?.id ?? "none"}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="relative z-10 text-center px-6 py-6"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-accent-light">
              FX WONDERS
              <motion.span className="h-1 w-1 rounded-full bg-accent-light" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }} />
              MT HUB
            </div>

            <AnimatePresence mode="wait">
              {displayed && (
                <motion.div
                  key={displayed.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mt-4 text-3xl md:text-4xl font-black tracking-tight">
                    {meta[accountKey(displayed)]?.hubLabel || displayed.label || displayed.broker}
                  </div>
                  <div className="mt-2 text-xs text-muted uppercase tracking-[0.3em] font-mono">
                    {displayed.platform} · {displayed.login}
                  </div>
                  <div className="mt-4 inline-flex items-center gap-4 rounded-2xl border border-border/50 bg-black/30 px-5 py-3 backdrop-blur-sm">
                    <MiniStat label="Broker" value={displayed.broker} />
                    <div className="h-6 w-px bg-border/60" />
                    <MiniStat label="Server" value={displayed.server} truncate />
                    <div className="h-6 w-px bg-border/60" />
                    <MiniStat label="Balance" value="pending" valueClass="text-muted" />
                    <div className="h-6 w-px bg-border/60" />
                    <MiniStat label="Equity" value="pending" valueClass="text-muted" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-6 text-[10px] uppercase tracking-[0.25em] text-muted">
              Hub rotates every 5 seconds · click a ring node to focus
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, valueClass }: { label: string; value: any; valueClass?: string }) {
  return (
    <div>
      <div className="text-muted uppercase tracking-wider">{label}</div>
      <div className={cn("font-mono font-semibold text-sm mt-1 text-foreground", valueClass)}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, valueClass, truncate }: { label: string; value: string | number; valueClass?: string; truncate?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className={cn("text-sm font-mono font-semibold mt-0.5", truncate && "max-w-[90px] truncate", valueClass)}>{value}</div>
    </div>
  );
}

function AccountOrbitRing({ accounts, focusLogin }: { accounts: Mt5Account[]; focusLogin: string | null }) {
  const others = accounts.filter((a) => a.login !== focusLogin).slice(0, 10);
  if (others.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <motion.div
        className="relative h-[440px] w-[440px] md:h-[520px] md:w-[520px]"
        animate={{ rotate: 360 }}
        transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
      >
        {others.map((a, i) => {
          const angle = (i / others.length) * Math.PI * 2;
          const radius = 220;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
            >
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
                className="rounded-full border border-border/50 bg-black/50 backdrop-blur-sm px-2.5 py-1 text-[10px] font-mono"
              >
                <span className="text-foreground font-semibold">{a.broker.split(" ")[0]}</span>
                <span className="ml-1 text-muted">{a.login}</span>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
