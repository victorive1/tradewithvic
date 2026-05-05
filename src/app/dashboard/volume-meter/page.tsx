"use client";

import { useState, useEffect } from "react";
import { VolumeMeterClient } from "./VolumeMeterClient";
import type { PairLiquidityScore } from "@/lib/volume-meter/types";

export default function VolumeMeterPage() {
  const [scores, setScores] = useState<PairLiquidityScore[]>([]);
  const [capturedAt, setCapturedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/volume-meter/scan");
        const data = await res.json();
        if (data.scores) setScores(data.scores as PairLiquidityScore[]);
        const cap = data.capturedAt ? new Date(data.capturedAt).getTime() : null;
        setCapturedAt(cap || data.timestamp || Date.now());
      } catch (e) {
        console.error("Volume Meter load failed:", e);
      }
      setLoading(false);
    }
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">FX Wonders Market Meat Engine</h1>
          <p className="text-sm text-muted mt-1">Loading liquidity & participation scores…</p>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-surface-3 rounded-xl" />
                <div className="flex-1"><div className="h-3 bg-surface-3 rounded w-full" /></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <VolumeMeterClient scores={scores} capturedAt={capturedAt} />;
}
