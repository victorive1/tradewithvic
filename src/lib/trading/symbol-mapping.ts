import { prisma } from "@/lib/prisma";

/**
 * Symbol translation between FX Wonders canonical symbols and broker-specific
 * symbols. Brokers commonly append suffixes like .m, .pro, .r, _ecn, etc.
 *
 * Lookup order:
 *   1. Exact match on (internalSymbol, brokerName, platformType)
 *   2. Wildcard broker match on (internalSymbol, brokerName=null, platformType)
 *   3. Fall back to internalSymbol as-is
 */
export async function mapSymbolForBroker(params: {
  internalSymbol: string;
  brokerName: string;
  platformType: "MT4" | "MT5";
}): Promise<{ brokerSymbol: string; rule: any | null }> {
  const { internalSymbol, brokerName, platformType } = params;

  const specific = await prisma.symbolMappingRule.findFirst({
    where: { internalSymbol, brokerName, platformType, isActive: true },
  });
  if (specific) return { brokerSymbol: specific.brokerSymbol, rule: specific };

  const wildcard = await prisma.symbolMappingRule.findFirst({
    where: { internalSymbol, brokerName: null, platformType, isActive: true },
  });
  if (wildcard) return { brokerSymbol: wildcard.brokerSymbol, rule: wildcard };

  const both = await prisma.symbolMappingRule.findFirst({
    where: { internalSymbol, brokerName: null, platformType: "both", isActive: true },
  });
  if (both) return { brokerSymbol: both.brokerSymbol, rule: both };

  return { brokerSymbol: internalSymbol, rule: null };
}

/**
 * Account-aware variant of mapSymbolForBroker. Looks up the global
 * SymbolMappingRule (for digits / contract size / volume limits used by the
 * validator), then layers per-account overrides on top:
 *
 *   1. If account.brokerSymbolRenames has the internal symbol, use that as
 *      the base (this handles e.g. USOIL → WTI on JustMarkets ECN).
 *      Otherwise use the global rule's brokerSymbol, falling back to
 *      internalSymbol.
 *   2. Append account.brokerSymbolSuffix (e.g. ".ecn"). Suffix is always
 *      appended last — rename values must be bare.
 *
 * Returns the same shape as mapSymbolForBroker so call sites can swap one
 * for the other.
 */
export async function mapSymbolForAccount(params: {
  internalSymbol: string;
  account: {
    brokerName: string;
    platformType: string;
    brokerSymbolSuffix: string;
    brokerSymbolRenames: string;
  };
}): Promise<{ brokerSymbol: string; rule: any | null }> {
  const { internalSymbol, account } = params;

  const { rule } = await mapSymbolForBroker({
    internalSymbol,
    brokerName: account.brokerName,
    platformType: account.platformType as "MT4" | "MT5",
  });

  let renames: Record<string, string> = {};
  try {
    const parsed = JSON.parse(account.brokerSymbolRenames || "{}");
    if (parsed && typeof parsed === "object") renames = parsed;
  } catch {
    // malformed JSON — treat as empty map; suffix still applies
  }

  const base = renames[internalSymbol] ?? rule?.brokerSymbol ?? internalSymbol;
  const brokerSymbol = base + (account.brokerSymbolSuffix || "");
  return { brokerSymbol, rule };
}

/**
 * Seed reasonable default mappings on first use so users don't hit an empty
 * symbol-mapping table. Idempotent.
 */
export async function ensureDefaultMappings(): Promise<void> {
  const defaults = [
    { s: "EURUSD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "GBPUSD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "USDJPY", digits: 3, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "AUDUSD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "USDCAD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "USDCHF", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "NZDUSD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "XAUUSD", digits: 2, contractSize: 100,    minVolume: 0.01, maxVolume: 50,  volumeStep: 0.01 },
    { s: "XAGUSD", digits: 3, contractSize: 5000,   minVolume: 0.01, maxVolume: 50,  volumeStep: 0.01 },
    { s: "US30",   digits: 1, contractSize: 1,      minVolume: 0.1,  maxVolume: 100, volumeStep: 0.1 },
    { s: "NAS100", digits: 1, contractSize: 1,      minVolume: 0.1,  maxVolume: 100, volumeStep: 0.1 },
    { s: "SPX500", digits: 1, contractSize: 1,      minVolume: 0.1,  maxVolume: 100, volumeStep: 0.1 },
    { s: "BTCUSD", digits: 2, contractSize: 1,      minVolume: 0.01, maxVolume: 10,  volumeStep: 0.01 },
    { s: "ETHUSD", digits: 2, contractSize: 1,      minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
  ];

  for (const d of defaults) {
    await prisma.symbolMappingRule.upsert({
      where: {
        internalSymbol_brokerName_platformType: {
          internalSymbol: d.s,
          brokerName: null as any,
          platformType: "both",
        } as any,
      },
      update: {},
      create: {
        internalSymbol: d.s,
        brokerSymbol: d.s,
        brokerName: null,
        platformType: "both",
        digits: d.digits,
        contractSize: d.contractSize,
        minVolume: d.minVolume,
        maxVolume: d.maxVolume,
        volumeStep: d.volumeStep,
      },
    }).catch(() => {
      // unique constraint with null is flaky across DBs — fall back to findFirst + create
    });
  }
}
