// Risk Profile presets — Quant Engine Blueprint § 10.
//
// Three named profiles map to the spec's exact caps. The profile itself
// lives on ExecutionAccount.riskProfile (string column, no schema change
// — we already store free-form strings in similar slots). At apply
// time, the preset overrides the matching numeric fields on the account
// so the rest of the runtime (algo gates, smart-exit, portfolio
// engine) reads them transparently and doesn't need to know whether a
// value came from a preset or a manual override.

export type RiskProfileKey = "off" | "conservative" | "balanced" | "aggressive";

export interface RiskProfile {
  key: RiskProfileKey;
  label: string;
  description: string;
  riskPerTradePct: number;
  maxConcurrentPositions: number;
  maxDailyLossPct: number;
  allowedGrades: string[];
}

export const RISK_PROFILES: Record<Exclude<RiskProfileKey, "off">, RiskProfile> = {
  conservative: {
    key: "conservative",
    label: "Conservative",
    description: "0.25% risk per trade, A+ only, max 1 open trade, max daily loss 1%.",
    riskPerTradePct: 0.25,
    maxConcurrentPositions: 1,
    maxDailyLossPct: 1.0,
    allowedGrades: ["A+"],
  },
  balanced: {
    key: "balanced",
    label: "Balanced",
    description: "0.5% risk per trade, A/A+ only, max 3 open trades, max daily loss 2%.",
    riskPerTradePct: 0.5,
    maxConcurrentPositions: 3,
    maxDailyLossPct: 2.0,
    allowedGrades: ["A", "A+"],
  },
  aggressive: {
    key: "aggressive",
    label: "Aggressive",
    description: "1% risk per trade, A/A+ only, max 5 open trades, max daily loss 4%.",
    riskPerTradePct: 1.0,
    maxConcurrentPositions: 5,
    maxDailyLossPct: 4.0,
    allowedGrades: ["A", "A+"],
  },
};

export const RISK_PROFILE_KEYS: RiskProfileKey[] = ["off", "conservative", "balanced", "aggressive"];

export function profileFor(key: string | null | undefined): RiskProfile | null {
  if (!key || key === "off") return null;
  if (key in RISK_PROFILES) return RISK_PROFILES[key as Exclude<RiskProfileKey, "off">];
  return null;
}

export interface ApplyResult {
  applied: boolean;
  profile: RiskProfile | null;
  changedFields: string[];
}

// Pure helper — given an account-shaped object and a profile key,
// returns a partial of the fields that need updating. Lets the caller
// (an admin endpoint, a one-off script) decide when/how to persist.
export function diffForProfile(
  account: { riskPerTradePct: number; maxConcurrentPositions: number; maxDailyLossPct: number; allowedGrades: string },
  key: RiskProfileKey,
): Partial<{ riskPerTradePct: number; maxConcurrentPositions: number; maxDailyLossPct: number; allowedGrades: string }> {
  const profile = profileFor(key);
  if (!profile) return {};
  const desiredGrades = JSON.stringify(profile.allowedGrades);
  const out: Partial<{ riskPerTradePct: number; maxConcurrentPositions: number; maxDailyLossPct: number; allowedGrades: string }> = {};
  if (account.riskPerTradePct !== profile.riskPerTradePct) out.riskPerTradePct = profile.riskPerTradePct;
  if (account.maxConcurrentPositions !== profile.maxConcurrentPositions) out.maxConcurrentPositions = profile.maxConcurrentPositions;
  if (account.maxDailyLossPct !== profile.maxDailyLossPct) out.maxDailyLossPct = profile.maxDailyLossPct;
  if (account.allowedGrades !== desiredGrades) out.allowedGrades = desiredGrades;
  return out;
}
