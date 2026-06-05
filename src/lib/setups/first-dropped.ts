// "First dropped" timestamp — the immutable origin time of a trade setup.
//
// This is DISTINCT from the relative "posted 2m ago" label rendered on
// cards. That label keeps ticking as time passes; this one is frozen at
// the moment the setup row was first created in the DB (createdAt, which
// Prisma sets via @default(now()) and never updates). We derive both the
// UTC clock string and the dominant trading session purely from that
// single immutable instant.
//
// Session windows are dominant, single-label, and cover all 24 UTC hours
// with no gaps and no overlap — so every timestamp maps to exactly one
// session. Boundaries are intentionally simple (the FX day has heavy
// overlap between sessions; we pick the one that "owns" each hour):
//
//   Tokyo     00:00–06:59 UTC   (Asian session)
//   London    07:00–12:59 UTC
//   New York  13:00–20:59 UTC
//   Sydney    21:00–23:59 UTC
//
// e.g. 12:45 UTC → London (NY opens at 13:00, so London still owns 12:xx).

export type FxSessionKey = "sydney" | "tokyo" | "london" | "new_york";

export interface FxSession {
  key: FxSessionKey;
  /** Human-readable label used in the "… session" suffix. */
  label: string;
}

const SESSIONS: Record<FxSessionKey, FxSession> = {
  sydney: { key: "sydney", label: "Sydney" },
  tokyo: { key: "tokyo", label: "Tokyo" },
  london: { key: "london", label: "London" },
  new_york: { key: "new_york", label: "New York" },
};

/**
 * Map a UTC instant to its single dominant trading session.
 * Deterministic — depends only on the UTC hour of `at`.
 */
export function sessionForUtc(at: Date): FxSession {
  const h = at.getUTCHours();
  if (h < 7) return SESSIONS.tokyo; // 00:00–06:59
  if (h < 13) return SESSIONS.london; // 07:00–12:59
  if (h < 21) return SESSIONS.new_york; // 13:00–20:59
  return SESSIONS.sydney; // 21:00–23:59
}

export interface FirstDropped {
  /** ISO string of the immutable origin instant. */
  iso: string;
  /** Zero-padded UTC clock, e.g. "12:45". */
  hhmm: string;
  /** The dominant session, e.g. { key: "london", label: "London" }. */
  session: FxSession;
  /** UTC calendar date, e.g. "5 Jun 2026". */
  date: string;
  /** Full sentence, e.g. "First dropped at 12:45 UTC · London session". */
  line: string;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function coerce(at: Date | string | number): Date {
  return at instanceof Date ? at : new Date(at);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Build the full "first dropped" descriptor from an immutable createdAt.
 * Accepts a Date, ISO string, or epoch ms.
 */
export function formatFirstDropped(at: Date | string | number): FirstDropped {
  const d = coerce(at);
  const session = sessionForUtc(d);
  const hhmm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return {
    iso: d.toISOString(),
    hhmm,
    session,
    date,
    line: `First dropped at ${hhmm} UTC · ${session.label} session`,
  };
}
