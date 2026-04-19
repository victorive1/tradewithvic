"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";

interface BrainSetup {
  id: string;
  symbol: string;
  timeframe: string;
  direction: string;
  setupType: string;
  qualityGrade: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  riskReward: number;
  confidenceScore: number;
}

export function ActiveSetupsFilter({ setups }: { setups: BrainSetup[] }) {
  const [timeframe, setTimeframe] = useState<TimeframeValue>("all");
  const counts = buildTimeframeCounts(setups, (s) => s.timeframe);
  const filtered = setups.filter((s) => matchesTimeframe(s.timeframe, timeframe));

  return (
    <>
      <TimeframeFilter value={timeframe} onChange={setTimeframe} counts={counts} className="mb-3" />
      {filtered.length === 0 ? (
        <p className="text-sm text-muted">
          No active setups{timeframe !== "all" ? ` on ${timeframe}` : ""}. Engine detects when conditions align — typically during market hours.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => {
            const isBull = s.direction === "bullish";
            const gradeColor = s.qualityGrade === "A+" ? "bg-purple-500/15 text-purple-300 border-purple-500/40"
              : s.qualityGrade === "A" ? "bg-green-500/15 text-green-400 border-green-500/40"
              : s.qualityGrade === "B" ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
              : "bg-muted/10 text-muted border-border";
            return (
              <Link
                key={s.id}
                href={`/dashboard/brain/decision/${s.id}`}
                className={cn("rounded-lg border p-3 block hover:opacity-90 transition-opacity", gradeColor)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">{s.symbol} · {s.timeframe}</span>
                  <span className="px-2 py-0.5 text-xs font-bold rounded border border-current bg-background/40">
                    {s.qualityGrade}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <span className={cn("uppercase font-bold", isBull ? "text-green-400" : "text-red-400")}>
                    {isBull ? "LONG" : "SHORT"}
                  </span>
                  <span className="text-muted">·</span>
                  <span className="uppercase">{s.setupType.replace(/_/g, " ")}</span>
                </div>
                <div className="mt-2 space-y-0.5 text-[11px] font-mono">
                  <div className="flex justify-between"><span className="text-muted">Entry</span><span>{s.entry.toFixed(5)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">SL</span><span className="text-red-400">{s.stopLoss.toFixed(5)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">TP1</span><span className="text-green-400">{s.takeProfit1.toFixed(5)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">RR</span><span>{s.riskReward.toFixed(2)}x · {s.confidenceScore}/100</span></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
