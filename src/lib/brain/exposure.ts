// Currency-level exposure engine — Quant Engine Blueprint § 11.
//
// Forex risk is not isolated by pair. Long EURUSD + long GBPUSD + short
// USDCHF + long AUDUSD looks like four uncorrelated trades but is in
// reality one large anti-USD position. This module computes net per-
// currency exposure across open positions so the algo runtime can
// reject trades that would push correlated exposure past a safe cap.
//
// Two units of measure are tracked per currency:
//   - posCount: number of open positions that have this currency LONG,
//     minus those that have it SHORT. (signed integer; useful for
//     "how many anti-USD trades am I in?" guards)
//   - riskUSD:  total $ at risk in this currency direction (signed).
//     Useful for portfolio-risk-pct caps.
//
// Symbol decoding: a 6-char forex pair "XXXYYY" splits into base XXX
// and quote YYY. LONG = +base, -quote. SHORT = -base, +quote. Non-FX
// instruments (metals, indices, crypto, oil) are decoded best-effort —
// XAUUSD trades USD; SPX500/NAS100/US30 trade USD; BTCUSD/ETHUSD trade
// USD. If we can't decode, the instrument is excluded (not an error).

const KNOWN_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]);

export type Currency = string;

export interface CurrencyLeg {
  currency: Currency;
  side: "long" | "short";
}

export interface PositionLite {
  symbol: string;
  direction: string; // bullish/bearish/buy/sell/long/short — accept all
  riskAmount: number;
}

export interface CurrencyExposureRow {
  currency: Currency;
  posCount: number; // signed: + = net long, - = net short
  riskUSD: number; // signed
  longCount: number;
  shortCount: number;
}

export interface ExposureSnapshot {
  byCurrency: Record<Currency, CurrencyExposureRow>;
  totalPositions: number;
}

const FOREX_REGEX = /^[A-Z]{3}[A-Z]{3}$/;

export function decodeSymbolCurrencies(symbol: string): { base: Currency | null; quote: Currency | null } {
  const s = symbol.toUpperCase();

  // Standard 6-char forex pair
  if (FOREX_REGEX.test(s)) {
    const base = s.slice(0, 3);
    const quote = s.slice(3, 6);
    if (KNOWN_CURRENCIES.has(base) && KNOWN_CURRENCIES.has(quote)) {
      return { base, quote };
    }
  }

  // Metals: XAU/XAG quoted vs USD
  if (s === "XAUUSD" || s === "XAGUSD") return { base: s.slice(0, 3), quote: "USD" };

  // Crypto majors quoted vs USD
  if (/^(BTC|ETH|SOL|XRP|ADA|DOT|LINK|DOGE|MATIC)USD$/.test(s)) {
    return { base: s.replace("USD", ""), quote: "USD" };
  }

  // US indices + WTI — primarily USD-denominated
  if (s === "US30" || s === "NAS100" || s === "SPX500" || s === "USOIL") {
    return { base: s, quote: "USD" };
  }

  // Other indices — non-USD (skip exposure for these for now)
  return { base: null, quote: null };
}

function isLong(direction: string): boolean {
  const d = direction.toLowerCase();
  return d === "buy" || d === "long" || d === "bullish";
}

export function legsForPosition(pos: PositionLite): CurrencyLeg[] {
  const { base, quote } = decodeSymbolCurrencies(pos.symbol);
  if (!base || !quote) return [];
  // Skip self-pairs ("US30" base = "US30" — only quote currency matters)
  const long = isLong(pos.direction);
  const legs: CurrencyLeg[] = [];
  if (KNOWN_CURRENCIES.has(base)) {
    legs.push({ currency: base, side: long ? "long" : "short" });
  }
  if (KNOWN_CURRENCIES.has(quote)) {
    legs.push({ currency: quote, side: long ? "short" : "long" });
  }
  return legs;
}

export function computeExposure(positions: readonly PositionLite[]): ExposureSnapshot {
  const map = new Map<Currency, CurrencyExposureRow>();

  for (const pos of positions) {
    const legs = legsForPosition(pos);
    for (const leg of legs) {
      const row = map.get(leg.currency) ?? {
        currency: leg.currency,
        posCount: 0,
        riskUSD: 0,
        longCount: 0,
        shortCount: 0,
      };
      const sign = leg.side === "long" ? 1 : -1;
      row.posCount += sign;
      row.riskUSD += sign * pos.riskAmount;
      if (leg.side === "long") row.longCount += 1;
      else row.shortCount += 1;
      map.set(leg.currency, row);
    }
  }

  const byCurrency: Record<Currency, CurrencyExposureRow> = {};
  for (const [k, v] of map) byCurrency[k] = v;

  return { byCurrency, totalPositions: positions.length };
}

export interface ExposureCheck {
  allowed: boolean;
  reason: string | null;
  triggered: { currency: Currency; afterCount: number; cap: number } | null;
}

export interface ExposureLimits {
  maxNetSameDirectionPerCurrency: number; // e.g. 4 → max 4 net same-direction positions on any single currency
  maxRiskPctPerCurrency: number; // e.g. 3% of account balance net per currency
  accountBalance: number; // for the % calc
}

// Decide whether adding `candidate` to the current `snapshot` would push any
// currency past the configured limits. Pure function — no DB calls; the
// algo runtime gathers snapshot + limits and asks once.
export function wouldExceedLimit(
  snapshot: ExposureSnapshot,
  candidate: PositionLite,
  limits: ExposureLimits,
): ExposureCheck {
  const candidateLegs = legsForPosition(candidate);
  if (candidateLegs.length === 0) return { allowed: true, reason: null, triggered: null };

  for (const leg of candidateLegs) {
    const row = snapshot.byCurrency[leg.currency];
    const currentCount = row?.posCount ?? 0;
    const currentRisk = row?.riskUSD ?? 0;
    const sign = leg.side === "long" ? 1 : -1;
    const afterCount = currentCount + sign;
    const afterRisk = currentRisk + sign * candidate.riskAmount;

    // Net-same-direction count check
    if (Math.abs(afterCount) > limits.maxNetSameDirectionPerCurrency) {
      return {
        allowed: false,
        reason: `net_${leg.side}_${leg.currency}_count`,
        triggered: { currency: leg.currency, afterCount, cap: limits.maxNetSameDirectionPerCurrency },
      };
    }

    // Net %-of-account risk check
    const pctOfBalance = limits.accountBalance > 0
      ? Math.abs(afterRisk) / limits.accountBalance * 100
      : 0;
    if (pctOfBalance > limits.maxRiskPctPerCurrency) {
      return {
        allowed: false,
        reason: `net_${leg.side}_${leg.currency}_risk_pct`,
        triggered: { currency: leg.currency, afterCount, cap: limits.maxRiskPctPerCurrency },
      };
    }
  }

  return { allowed: true, reason: null, triggered: null };
}
