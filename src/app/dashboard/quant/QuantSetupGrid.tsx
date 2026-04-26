"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { computeOneR } from "@/lib/setups/one-r";
import { QuantCardNotes } from "./QuantCardNotes";
import { AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";

export interface SetupRow {
  id: string;
  symbol: string;
  direction: string;
  setupType: string;
  timeframe: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: string;
  explanation: string | null;
  invalidation: string | null;
}

export interface StrategyMeta {
  key: string;
  label: string;
}

// Order timeframes by canonical resolution. Anything not in this list falls
// to the end alphabetically — keeps unusual timeframes visible without
// hardcoding every possibility.
const TF_ORDER = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
function tfRank(tf: string): number {
  const i = TF_ORDER.indexOf(tf);
  return i === -1 ? TF_ORDER.length : i;
}

interface Props {
  setups: SetupRow[];
  strategies: StrategyMeta[];
}

export function QuantSetupGrid({ setups, strategies }: Props) {
  const [tf, setTf] = useState<string>("all");
  const [strategy, setStrategy] = useState<string>("all");

  const availableTimeframes = useMemo(() => {
    const set = new Set(setups.map((s) => s.timeframe));
    return Array.from(set).sort((a, b) => tfRank(a) - tfRank(b));
  }, [setups]);

  const filtered = useMemo(() => {
    return setups.filter((s) => {
      if (tf !== "all" && s.timeframe !== tf) return false;
      if (strategy !== "all" && s.setupType !== strategy) return false;
      return true;
    });
  }, [setups, tf, strategy]);

  if (setups.length === 0) {
    return (
      <div className="glass-card p-10 text-center space-y-3">
        <div className="text-3xl opacity-40">∅</div>
        <p className="text-fluid-sm text-muted">
          No active Quant setups right now. The brain scans every 2 minutes;
          setups appear here when a Blueprint-tier strategy detects a valid
          pattern in the live candle stream.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <FilterRow
          label="Timeframe"
          options={[{ value: "all", label: "All" }, ...availableTimeframes.map((t) => ({ value: t, label: t }))]}
          value={tf}
          onChange={setTf}
        />
        <FilterRow
          label="Strategy"
          options={[{ value: "all", label: "All" }, ...strategies.map((s) => ({ value: s.key, label: s.label }))]}
          value={strategy}
          onChange={setStrategy}
        />
      </div>

      <div className="text-[11px] text-muted">
        Showing {filtered.length} of {setups.length} setup{setups.length === 1 ? "" : "s"}
        {(tf !== "all" || strategy !== "all") && (
          <button
            onClick={() => { setTf("all"); setStrategy("all"); }}
            className="ml-2 text-accent-light hover:text-accent underline"
          >
            clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-muted">
          No setups match these filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <QuantSetupCard key={s.id} setup={s} strategies={strategies} />
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterRowProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (next: string) => void;
}

function FilterRow({ label, options, value, onChange }: FilterRowProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-muted w-20 shrink-0">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs transition-smooth border",
              value === opt.value
                ? "bg-accent text-white border-accent"
                : "bg-surface-2 text-muted-light border-border/50 hover:border-border-light",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuantSetupCard({ setup, strategies }: { setup: SetupRow; strategies: StrategyMeta[] }) {
  const isLong = setup.direction === "bullish" || setup.direction === "long" || setup.direction === "buy";
  const grade = setup.qualityGrade;
  const gradeClass =
    grade === "A+" ? "bg-bull/15 text-bull-light border-bull/40" :
    grade === "A" ? "bg-bull/10 text-bull-light border-bull/30" :
    grade === "B" ? "bg-warn/10 text-warn-light border-warn/30" :
    "bg-surface-2 text-muted border-border/40";
  const oneR = computeOneR(setup.entry, setup.stopLoss, setup.direction);
  const strategyLabel = strategies.find((q) => q.key === setup.setupType)?.label ?? setup.setupType.replace(/_/g, " ");

  return (
    <Link
      href={`/dashboard/brain/decision/${setup.id}`}
      className="glass-card glass-card-hover overflow-hidden block"
    >
      <div className={cn("h-1", isLong ? "bg-bull" : "bg-bear")} />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-sm">{setup.symbol}</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-muted">
              {setup.timeframe}
            </span>
            <span className={cn(
              "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded",
              isLong ? "text-bull-light" : "text-bear-light",
            )}>
              {isLong ? "▲ LONG" : "▼ SHORT"}
            </span>
          </div>
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", gradeClass)}>
            {grade}
          </span>
        </div>

        <div className="text-[11px] uppercase tracking-wider text-accent-light font-semibold">
          {strategyLabel}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono">
          <div className="flex justify-between"><span className="text-muted">Entry</span><span>{setup.entry.toFixed(5)}</span></div>
          <div className="flex justify-between"><span className="text-muted">SL</span><span className="text-bear-light">{setup.stopLoss.toFixed(5)}</span></div>
          <div className="flex justify-between"><span className="text-muted">1R</span><span className="text-blue-300">{oneR.toFixed(5)}</span></div>
          <div className="flex justify-between"><span className="text-muted">TP1</span><span className="text-green-400">{setup.takeProfit1.toFixed(5)}</span></div>
          {setup.takeProfit2 != null && (
            <div className="flex justify-between"><span className="text-muted">TP2</span><span className="text-green-400/80">{setup.takeProfit2.toFixed(5)}</span></div>
          )}
          {setup.takeProfit3 != null && (
            <div className="flex justify-between"><span className="text-muted">TP3</span><span className="text-green-400/60">{setup.takeProfit3.toFixed(5)}</span></div>
          )}
          <div className="flex justify-between col-span-2 border-t border-border/30 pt-1 mt-1">
            <span className="text-muted">RR · Score</span>
            <span>{setup.riskReward.toFixed(2)}× · {setup.confidenceScore}/100</span>
          </div>
          <div className="col-span-2">
            <AdminLotSizeForCard symbol={setup.symbol} entry={setup.entry} stopLoss={setup.stopLoss} />
          </div>
        </div>

        <QuantCardNotes explanation={setup.explanation} invalidation={setup.invalidation} />
      </div>
    </Link>
  );
}
