// Symbol-aware lot sizer. Computes the standard-lot size required to
// risk a given $ amount at a given stop-loss distance, accounting for
// the instrument's pip granularity, contract size, and quote currency.
//
// Conventions used:
//   - Forex standard lot = 100,000 base units.
//   - JPY-quoted pair: pip = 0.01.
//   - All other forex pairs: pip = 0.0001.
//   - XAUUSD: pip = 0.10, contract = 100 oz → $10 per pip per std lot.
//   - XAGUSD: pip = 0.001, contract = 5000 oz → $5 per pip per std lot.
//   - USOIL:  pip = 0.01,  contract = 1000 bbl → $10 per pip per std lot.
//   - US30 / NAS100 / SPX500 / GER40: pip = 1 point, $1 per point per
//     std contract (broker-typical).
//   - BTCUSD / ETHUSD: pip = $1, contract = 1 unit → $1 per pip.
//   - SOLUSD / XRPUSD: pip = $0.01, contract = 1 unit.
//
// Cross-pair approximations (no rate lookup):
//   - USD/XXX pairs: pipValue = (pip * contract) / entryPrice, exact.
//   - JPY crosses (EURJPY etc): approximated by dividing by entryPrice;
//     rough but close. The Notes field on the result calls this out.
//   - EURGBP: approximated using a fixed GBPUSD ≈ 1.27 multiplier.

export interface LotInputs {
  symbol: string;
  entry: number;
  stopLoss: number;
  riskUSD: number;
}

export interface LotResult {
  lotSize: number;            // standard lots
  miniLots: number;           // = lotSize * 10
  microLots: number;          // = lotSize * 100
  units: number;              // total instrument units (lotSize * contractSize)
  pipValue: number;           // $ per pip per 1 standard lot
  slPips: number;
  slDistance: number;         // raw price distance
  contractSize: number;
  pipDecimal: number;
  pipUnitLabel: string;       // "pip" / "point" / "$" — for display
  notes: string[];
  warnings: string[];
}

const JPY_PAIRS = new Set(["USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "NZDJPY", "CADJPY", "CHFJPY"]);
const METALS = new Set(["XAUUSD", "XAGUSD"]);
const ENERGY = new Set(["USOIL", "UKOIL"]);
const INDICES = new Set(["US30", "NAS100", "SPX500", "GER40", "UK100", "JPN225"]);
const CRYPTO_UNIT_PIP = new Set(["BTCUSD", "ETHUSD"]);
const CRYPTO_CENT_PIP = new Set(["SOLUSD", "XRPUSD"]);

function pipDecimalFor(symbol: string): number {
  if (JPY_PAIRS.has(symbol)) return 0.01;
  if (symbol === "XAUUSD") return 0.1;
  if (symbol === "XAGUSD") return 0.001;
  if (ENERGY.has(symbol)) return 0.01;
  if (INDICES.has(symbol)) return 1;
  if (CRYPTO_UNIT_PIP.has(symbol)) return 1;
  if (CRYPTO_CENT_PIP.has(symbol)) return 0.01;
  return 0.0001; // default forex 4/5-decimal
}

function contractSizeFor(symbol: string): number {
  if (symbol === "XAUUSD") return 100;     // 100 troy oz
  if (symbol === "XAGUSD") return 5000;    // 5000 troy oz
  if (ENERGY.has(symbol)) return 1000;     // 1000 barrels
  if (INDICES.has(symbol)) return 1;       // 1 contract
  if (CRYPTO_UNIT_PIP.has(symbol) || CRYPTO_CENT_PIP.has(symbol)) return 1; // 1 coin
  return 100_000;                          // standard forex lot
}

function pipUnitLabelFor(symbol: string): string {
  if (INDICES.has(symbol)) return "point";
  if (CRYPTO_UNIT_PIP.has(symbol)) return "$";
  return "pip";
}

function isUsdQuoteForex(symbol: string): boolean {
  if (METALS.has(symbol) || ENERGY.has(symbol) || INDICES.has(symbol)) return false;
  if (CRYPTO_UNIT_PIP.has(symbol) || CRYPTO_CENT_PIP.has(symbol)) return false;
  return symbol.length === 6 && symbol.endsWith("USD");
}

function isUsdBaseForex(symbol: string): boolean {
  if (METALS.has(symbol) || ENERGY.has(symbol) || INDICES.has(symbol)) return false;
  if (CRYPTO_UNIT_PIP.has(symbol) || CRYPTO_CENT_PIP.has(symbol)) return false;
  return symbol.length === 6 && symbol.startsWith("USD");
}

function pipValuePerStdLot(symbol: string, entryPrice: number, notes: string[], warnings: string[]): number {
  const pip = pipDecimalFor(symbol);
  const contract = contractSizeFor(symbol);

  // USD-quoted forex (EURUSD, GBPUSD, AUDUSD, etc.) → exact
  if (isUsdQuoteForex(symbol)) return pip * contract;

  // USD-base forex (USDJPY, USDCHF, USDCAD) → divide by entry price
  if (isUsdBaseForex(symbol)) {
    if (entryPrice > 0) return (pip * contract) / entryPrice;
    warnings.push(`${symbol}: entry price required for accurate pip value`);
    return pip * contract;
  }

  // Metals
  if (symbol === "XAUUSD") return pip * contract; // 0.1 * 100 = $10
  if (symbol === "XAGUSD") return pip * contract; // 0.001 * 5000 = $5

  // Energy
  if (ENERGY.has(symbol)) return pip * contract; // 0.01 * 1000 = $10

  // Indices (USD-denominated)
  if (symbol === "US30" || symbol === "NAS100" || symbol === "SPX500") return pip * contract; // $1
  if (symbol === "GER40") {
    notes.push("GER40 is EUR-denominated — pip value approximated, broker quote may differ");
    return pip * contract;
  }
  if (symbol === "UK100") {
    notes.push("UK100 is GBP-denominated — pip value approximated using GBPUSD ≈ 1.27");
    return pip * contract * 1.27;
  }
  if (symbol === "JPN225") {
    if (entryPrice > 0) {
      notes.push("JPN225 is JPY-denominated — pip value approximated by dividing by entry");
      return (pip * contract) / entryPrice;
    }
    return pip * contract;
  }

  // Crypto
  if (CRYPTO_UNIT_PIP.has(symbol) || CRYPTO_CENT_PIP.has(symbol)) return pip * contract;

  // JPY crosses (EURJPY, GBPJPY, etc.) — approximate by dividing by entry
  if (JPY_PAIRS.has(symbol) && symbol !== "USDJPY") {
    if (entryPrice > 0) {
      notes.push(`${symbol}: pip value approximated using entry as proxy for USD/JPY rate`);
      return (pip * contract) / entryPrice;
    }
    return pip * contract;
  }

  // EURGBP and other GBP-quoted crosses
  if (symbol === "EURGBP") {
    notes.push("EURGBP: pip value approximated using GBPUSD ≈ 1.27");
    return pip * contract * 1.27;
  }

  // Fallback — best guess
  warnings.push(`${symbol}: no specific pip-value rule, using pip × contract as approximation`);
  return pip * contract;
}

export function computeLotSize(inputs: LotInputs): LotResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const pip = pipDecimalFor(inputs.symbol);
  const contract = contractSizeFor(inputs.symbol);
  const slDistance = Math.abs(inputs.entry - inputs.stopLoss);
  const slPips = pip > 0 ? slDistance / pip : 0;
  const pipValue = pipValuePerStdLot(inputs.symbol, inputs.entry, notes, warnings);
  const dollarsAtRiskPerLot = pipValue * slPips;
  const lotSize = dollarsAtRiskPerLot > 0 ? inputs.riskUSD / dollarsAtRiskPerLot : 0;

  if (slDistance <= 0) warnings.push("Stop loss equals entry — set a non-zero distance.");
  if (inputs.riskUSD <= 0) warnings.push("Risk amount is zero — set a positive $ risk.");

  return {
    lotSize,
    miniLots: lotSize * 10,
    microLots: lotSize * 100,
    units: lotSize * contract,
    pipValue,
    slPips,
    slDistance,
    contractSize: contract,
    pipDecimal: pip,
    pipUnitLabel: pipUnitLabelFor(inputs.symbol),
    notes,
    warnings,
  };
}
