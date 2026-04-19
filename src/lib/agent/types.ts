/**
 * Shared types for the Agent diagnostics panel. An "engine" is a logical
 * system in the app (Market Radar, Brain, Brain Execution, …) that has its
 * own health story; each engine runs a set of probes whose worst result
 * drives the engine's overall status.
 */

export type ProbeStatus = "healthy" | "warning" | "critical" | "unknown";

export interface ProbeResult {
  id: string;
  label: string;
  status: ProbeStatus;
  message: string;       // one-liner shown on cards
  detail?: string;       // longer context for the drill-down
  value?: string | number | null;
  expected?: string;     // human-readable threshold
  // If set, the UI shows a "Fix" button for this probe that POSTs to
  // /api/agent/remediate with this recipeId. Only surface when the probe
  // is failing — healthy probes don't need a fix.
  remediationId?: string;
  remediationLabel?: string;
}

export interface EngineStatus {
  id: string;
  label: string;
  route: string;            // deep link to the user-facing page
  summary: string;          // what the engine does, one sentence
  status: ProbeStatus;      // overall — worst of all probes
  statusMessage: string;    // one-line summary of why that status
  lastUpdatedAt: string | null;  // ISO string, from the engine's freshest data
  probes: ProbeResult[];
  dataSources: DataSourceSnapshot[];
  dependencies: EngineDependencySnapshot[];
  recentErrors: RecentError[];
  note?: string;            // freeform notes surfaced in the card
}

export interface DataSourceSnapshot {
  label: string;
  tableName: string;
  rowCount: number;
  lastUpdatedAt: string | null;
  ageSeconds: number | null;
  status: ProbeStatus;
  note?: string;
}

export interface EngineDependencySnapshot {
  engineId: string;
  label: string;
  status: ProbeStatus;
  statusMessage: string;
}

export interface RecentError {
  at: string;       // ISO
  source: string;   // table or logical origin
  code: string;
  message: string;
}

export function worstStatus(statuses: ProbeStatus[]): ProbeStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  if (statuses.length === 0 || statuses.every((s) => s === "unknown")) return "unknown";
  return "healthy";
}

export function formatAgoSeconds(secs: number | null): string {
  if (secs == null) return "—";
  if (secs < 60) return `${Math.round(secs)}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
