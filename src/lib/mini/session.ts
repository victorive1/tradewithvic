// Session classifier — Mini blueprint § 4 (Session Engine).
//
// The intraday engine treats different market windows as different
// regimes: liquidity behaves differently in the Asian session (thin,
// ranging) than at the LDN/NY overlap (peak institutional flow). A
// signal scoring 95 in dead-zone hours is suspicious; the same signal
// at 13:30 UTC is gold.
//
// Session windows are UTC by spec.

export type SessionPhase =
  | "asian"
  | "london_premarket"
  | "london"
  | "ldn_ny_overlap"
  | "ny"
  | "ny_lunch"
  | "ny_afternoon"
  | "post_ny"
  | "dead";

export interface SessionState {
  phase: SessionPhase;
  // Human-readable session name for UI / evidence strings.
  label: string;
  // Killzone weight for the TIME component in scoring (0-5 pts cap).
  // The mini scoring formula reserves 5 pts for session timing — the
  // overlap and NY open carry the full weight.
  timingScore: 0 | 1 | 2 | 3 | 4 | 5;
  // Trades during a news lockout get blocked outright. v1 supports manual
  // override windows via env; Phase 3 wires Forex Factory.
  newsLockout: boolean;
  // Some templates only fire during specific windows (Silver Bullet,
  // London Breakout, News Cooldown). Surfaced so detector can early-exit.
  hourUtc: number;
  minuteUtc: number;
  // True when the session window is unsuitable for fast intraday trades —
  // either dead liquidity or known choppy zones (NY lunch).
  noTradeZone: boolean;
  noTradeReason?: string;
}

export function classifySession(now: Date = new Date()): SessionState {
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const inWindow = (start: number, end: number) => h >= start && h < end;

  let phase: SessionPhase;
  let label: string;
  let timingScore: SessionState["timingScore"] = 0;
  let noTradeZone = false;
  let noTradeReason: string | undefined;

  if (inWindow(0, 7))         { phase = "asian";            label = "Asian";          timingScore = 1; }
  else if (inWindow(7, 8))    { phase = "london_premarket"; label = "London Pre-Mkt"; timingScore = 2; }
  else if (inWindow(8, 12))   { phase = "london";           label = "London";         timingScore = 4; }
  else if (inWindow(12, 13))  { phase = "ldn_ny_overlap";   label = "LDN/NY Overlap"; timingScore = 5; }
  else if (inWindow(13, 16))  { phase = "ny";               label = "NY Open";        timingScore = 5; }
  else if (h === 16 && m < 30){ phase = "ny";               label = "NY Open";        timingScore = 4; }
  else if (inWindow(17, 18))  { phase = "ny_lunch";         label = "NY Lunch";       timingScore = 1;
                                noTradeZone = true; noTradeReason = "NY lunch chop"; }
  else if (inWindow(18, 21))  { phase = "ny_afternoon";     label = "NY Afternoon";   timingScore = 3; }
  else if (inWindow(21, 22))  { phase = "post_ny";          label = "Post-NY";        timingScore = 2; }
  else                         { phase = "dead";             label = "Dead Zone";      timingScore = 0;
                                 noTradeZone = true; noTradeReason = "outside active sessions"; }

  // Manual news lockout via env: comma-separated UTC HH:MM ranges
  // e.g. "13:25-13:35,18:55-19:10" — covers FOMC + scheduled high-impact
  // releases. Phase 3 will replace with a Forex Factory feed.
  const newsLockout = isInsideManualNewsLockout(h, m);

  return {
    phase,
    label,
    timingScore,
    newsLockout,
    hourUtc: h,
    minuteUtc: m,
    noTradeZone: noTradeZone || newsLockout,
    noTradeReason: newsLockout ? "news lockout active" : noTradeReason,
  };
}

function isInsideManualNewsLockout(h: number, m: number): boolean {
  const env = process.env.MINI_NEWS_LOCKOUT_WINDOWS;
  if (!env) return false;
  const nowMin = h * 60 + m;
  for (const range of env.split(",")) {
    const [a, b] = range.split("-");
    if (!a || !b) continue;
    const [ah, am] = a.split(":").map((x) => parseInt(x, 10));
    const [bh, bm] = b.split(":").map((x) => parseInt(x, 10));
    if (Number.isFinite(ah) && Number.isFinite(am) && Number.isFinite(bh) && Number.isFinite(bm)) {
      const start = ah * 60 + am;
      const end = bh * 60 + bm;
      if (nowMin >= start && nowMin <= end) return true;
    }
  }
  return false;
}

// Convenience for templates that need to know "is now a session where
// the spec says to fire". Used by Silver Bullet (which is also wired
// in the Strategy Bible) and London Breakout.
export function isInLondonOpen(s: SessionState): boolean {
  return s.phase === "london" && s.hourUtc < 10;
}
export function isInNyOpen(s: SessionState): boolean {
  return s.phase === "ny" && s.hourUtc < 16;
}
export function isInPrimeWindow(s: SessionState): boolean {
  return s.phase === "ldn_ny_overlap" || isInLondonOpen(s) || isInNyOpen(s);
}
