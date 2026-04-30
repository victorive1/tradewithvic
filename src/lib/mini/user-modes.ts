// User Modes — Mini blueprint § 14.
//
// Each mode is a filter preset that adjusts:
//   • allowed templates (fewer for confirmation, more for aggressive)
//   • minimum score threshold (Day Trader = 78, Confirmation = 88)
//   • allowed entry types (Confirmation requires retest/confirmation only)
//   • allowed timeframes
//
// Modes live in localStorage on the page, so each user can pick the
// preset that matches their style. Default = Day Trader.

export type UserMode = "scalper" | "day_trader" | "confirmation" | "aggressive";

export interface UserModeConfig {
  id: UserMode;
  label: string;
  description: string;
  minScore: number;
  allowedGrades: string[];
  allowedTemplates: string[] | "all";
  allowedEntryTypes: string[] | "all";
  allowedSpeedClasses: string[] | "all";
}

const ALL_TEMPLATES = [
  "liquidity_sweep_reversal",
  "intraday_trend_continuation",
  "breakout_retest",
  "vwap_reclaim",
  "inverse_fvg_flip",
  "compression_breakout",
  "news_cooldown_continuation",
];

export const USER_MODES: Record<UserMode, UserModeConfig> = {
  scalper: {
    id: "scalper",
    label: "Scalper",
    description: "5m entries, 5-30 min holds. Tight stops, TP1 priority. Higher signal volume.",
    minScore: 78,
    allowedGrades: ["A+", "A"],
    allowedTemplates: [
      "liquidity_sweep_reversal",
      "vwap_reclaim",
      "inverse_fvg_flip",
      "compression_breakout",
    ],
    allowedEntryTypes: "all",
    allowedSpeedClasses: ["scalp_5m"],
  },
  day_trader: {
    id: "day_trader",
    label: "Day Trader",
    description: "5m and 15m entries, 30 min - 4h holds. Default mode — balanced quality and frequency.",
    minScore: 78,
    allowedGrades: ["A+", "A"],
    allowedTemplates: "all",
    allowedEntryTypes: "all",
    allowedSpeedClasses: "all",
  },
  confirmation: {
    id: "confirmation",
    label: "Confirmation",
    description: "Fewer signals, A+ only, retest entries preferred. The conservative preset.",
    minScore: 88,
    allowedGrades: ["A+"],
    allowedTemplates: ALL_TEMPLATES,
    allowedEntryTypes: ["retest", "confirmation"],
    allowedSpeedClasses: "all",
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive",
    description: "Earlier entries, more alerts. Includes market and breakout entries; for experienced traders.",
    minScore: 75,
    allowedGrades: ["A+", "A"],
    allowedTemplates: "all",
    allowedEntryTypes: "all",
    allowedSpeedClasses: "all",
  },
};

// Filter applied client-side over the API response. Server-side filter
// would require user-mode-aware API params; client-side is simpler and
// keeps the API generic.
export function applyUserMode<T extends {
  template: string;
  entryType: string;
  speedClass: string;
  score: number;
  grade: string;
}>(signals: T[], mode: UserMode): T[] {
  const cfg = USER_MODES[mode];
  return signals.filter((s) => {
    if (s.score < cfg.minScore) return false;
    if (!cfg.allowedGrades.includes(s.grade)) return false;
    if (cfg.allowedTemplates !== "all" && !cfg.allowedTemplates.includes(s.template)) return false;
    if (cfg.allowedEntryTypes !== "all" && !cfg.allowedEntryTypes.includes(s.entryType)) return false;
    if (cfg.allowedSpeedClasses !== "all" && !cfg.allowedSpeedClasses.includes(s.speedClass)) return false;
    return true;
  });
}
