"use client";

import { cn } from "@/lib/utils";

export const TIMEFRAME_OPTIONS = ["all", "5m", "15m", "1h", "4h"] as const;
export type TimeframeValue = (typeof TIMEFRAME_OPTIONS)[number];

const LABELS: Record<TimeframeValue, string> = {
  all: "All",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
};

/**
 * Normalise a setup's raw timeframe string to one of our filter buckets.
 * Different surfaces use different casings / suffixes ("5min", "M5", "1H").
 * Anything we don't recognise falls back to "" so it's filtered out when a
 * specific TF is selected, but always passes when "all" is chosen.
 */
export function canonicalTimeframe(raw: string | null | undefined): TimeframeValue | "" {
  if (!raw) return "";
  const s = String(raw).toLowerCase().replace(/\s+/g, "");
  if (s === "5m" || s === "5min" || s === "m5" || s === "5minute" || s === "5minutes") return "5m";
  if (s === "15m" || s === "15min" || s === "m15" || s === "15minute" || s === "15minutes") return "15m";
  if (s === "1h" || s === "60m" || s === "60min" || s === "h1" || s === "1hour") return "1h";
  if (s === "4h" || s === "240m" || s === "240min" || s === "h4" || s === "4hour") return "4h";
  return "";
}

export function matchesTimeframe(setupTimeframe: string | null | undefined, filter: TimeframeValue): boolean {
  if (filter === "all") return true;
  return canonicalTimeframe(setupTimeframe) === filter;
}

export function TimeframeFilter({
  value,
  onChange,
  counts,
  className,
}: {
  value: TimeframeValue;
  onChange: (v: TimeframeValue) => void;
  // Optional — show per-TF counts in the chip. Pass the FULL unfiltered list
  // so counts don't change when the filter itself changes.
  counts?: Partial<Record<TimeframeValue, number>>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {TIMEFRAME_OPTIONS.map((tf) => {
        const active = value === tf;
        const n = counts?.[tf];
        return (
          <button
            key={tf}
            type="button"
            onClick={() => onChange(tf)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
              active
                ? "bg-accent text-white border-accent"
                : "bg-surface-2 text-muted-light border-border/50 hover:border-border-light",
            )}
          >
            {LABELS[tf]}
            {n != null && <span className={cn("ml-1.5 text-[10px]", active ? "opacity-80" : "text-muted")}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Build a count map for the filter chips from a list of items.
 * `all` counts everything; other chips count only items whose
 * canonical timeframe matches.
 */
export function buildTimeframeCounts<T>(items: T[], getTimeframe: (item: T) => string | null | undefined): Record<TimeframeValue, number> {
  const counts: Record<TimeframeValue, number> = { all: items.length, "5m": 0, "15m": 0, "1h": 0, "4h": 0 };
  for (const item of items) {
    const tf = canonicalTimeframe(getTimeframe(item));
    if (tf) counts[tf]++;
  }
  return counts;
}
