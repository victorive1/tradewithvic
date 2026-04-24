// Keyword-based severity + symbol scorer for breaking headlines.
// Deterministic and cheap; a Haiku pass for nuance is a follow-up.

export type Severity = "red" | "orange" | "green";
export type Category = "macro" | "geopolitical" | "central_bank" | "commodity" | "general";

interface Rule {
  keywords: RegExp[];
  severity: Severity;
  category: Category;
  symbols: string[];
}

// Ordered: first match wins, so put the most severe rules first.
const RULES: Rule[] = [
  // Trump headlines paired with a market-moving action — tariffs,
  // sanctions, firing/pressuring the Fed, executive orders, Iran/China
  // escalation. Red because these historically move USD, gold, indices,
  // oil, and crypto in the same session the headline drops.
  {
    keywords: [
      /\bTrump\b.*\b(?:tariff|tariffs|sanction|sanctions|executive order|signs|fires|threat(?:en|s)?|impose|deal|pact)\b/i,
      /\b(?:tariff|tariffs|sanction|sanctions|executive order)\b.*\bTrump\b/i,
      /\bTrump\b.*\b(?:Iran|China|Russia|North Korea|Putin|Xi|Kim Jong[- ]?Un)\b/i,
      /\bTrump\b.*\b(?:Fed|Powell|Federal Reserve)\b/i,
    ],
    severity: "red",
    category: "geopolitical",
    symbols: ["EURUSD", "USDJPY", "XAUUSD", "US30", "US500", "NAS100", "USOIL", "BTCUSD"],
  },
  // Tariff / trade-war headlines that don't necessarily mention Trump
  // by name ("US imposes 25% tariff on Chinese EVs", "China retaliates
  // with tariffs"). Always market-moving on risk assets.
  {
    keywords: [
      /\btariff(?:s)?\b/i, /\btrade war\b/i, /\btrade deal\b/i,
      /\bretaliat(?:e|ion|ory)\b/i, /\bimport\s+dut(?:y|ies)\b/i,
    ],
    severity: "red",
    category: "geopolitical",
    symbols: ["EURUSD", "USDJPY", "XAUUSD", "US30", "US500", "NAS100", "USOIL"],
  },
  // Expanded war / active-conflict keywords. More signals than the
  // legacy rule caught: drones, airstrikes, bombings, troop movements,
  // nuclear/ballistic, shelling, escalation language.
  {
    keywords: [
      /\bwar\b/i, /\binvasion\b/i, /\bstrike(?:s|d)?\b/i, /\bmissile(?:s)?\b/i,
      /\battack(?:s|ed)?\b/i, /\bsanction(?:s|ed)?\b/i, /\bceasefire\b/i,
      /\bdrone(?:s)?\s+(?:strike|attack|hit)/i, /\bairstrike(?:s)?\b/i,
      /\bbomb(?:ing|ed|s)?\b/i, /\bshelling\b/i, /\btroop(?:s)?\s+deploy/i,
      /\bmilitary\s+(?:action|operation|offensive|intervention)/i,
      /\bnuclear\b/i, /\bballistic\b/i, /\boccup(?:y|ied|ation)\b/i,
      /\bconflict\s+escalat/i, /\bescalat(?:es|ion|ing)\b/i,
    ],
    severity: "red",
    category: "geopolitical",
    symbols: ["XAUUSD", "USOIL", "BTCUSD"],
  },
  {
    keywords: [/\bCPI\b/i, /\binflation\b/i, /\bPCE\b/i, /\bPPI\b/i],
    severity: "red",
    category: "macro",
    symbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "US30", "US500", "NAS100"],
  },
  {
    keywords: [/\bFOMC\b/i, /\bFed(?:eral Reserve)?\s+(?:decision|meeting|rate)/i, /\brate\s+decision\b/i, /\binterest\s+rate\b/i, /\bhike(?:s|d)?\b/i, /\bcut(?:s)?\s+rate/i],
    severity: "red",
    category: "central_bank",
    symbols: ["EURUSD", "GBPUSD", "USDJPY", "USDCAD", "XAUUSD", "US30", "US500", "NAS100"],
  },
  {
    keywords: [/\bECB\b/i, /\bLagarde\b/i],
    severity: "orange",
    category: "central_bank",
    symbols: ["EURUSD", "EURGBP", "EURJPY"],
  },
  {
    keywords: [/\bBOE\b/i, /\bBank of England\b/i, /\bBailey\b/i],
    severity: "orange",
    category: "central_bank",
    symbols: ["GBPUSD", "EURGBP", "GBPJPY"],
  },
  {
    keywords: [/\bBOJ\b/i, /\bBank of Japan\b/i, /\bUeda\b/i],
    severity: "orange",
    category: "central_bank",
    symbols: ["USDJPY", "EURJPY", "GBPJPY"],
  },
  {
    keywords: [/\bNFP\b/i, /\bnon[-\s]?farm\b/i, /\bunemployment\b/i, /\bpayroll(?:s)?\b/i, /\bjobless\b/i],
    severity: "red",
    category: "macro",
    symbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "US30", "US500", "NAS100"],
  },
  {
    keywords: [/\bGDP\b/i],
    severity: "red",
    category: "macro",
    symbols: ["EURUSD", "GBPUSD", "USDJPY", "US30", "US500"],
  },
  {
    keywords: [/\bPowell\b/i, /\bJerome Powell\b/i],
    severity: "orange",
    category: "central_bank",
    symbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "US30", "US500"],
  },
  {
    keywords: [/\bretail sales\b/i, /\bPMI\b/i, /\bISM\b/i, /\bconsumer confidence\b/i, /\bconsumer sentiment\b/i],
    severity: "orange",
    category: "macro",
    symbols: ["EURUSD", "GBPUSD", "US30", "US500"],
  },
  {
    keywords: [/\bOPEC\b/i, /\bcrude(?:\s+oil)?\b/i, /\boil\s+(?:price|supply|output|cut)/i],
    severity: "orange",
    category: "commodity",
    symbols: ["USOIL", "USDCAD"],
  },
  {
    keywords: [/\bgold\b/i],
    severity: "orange",
    category: "commodity",
    symbols: ["XAUUSD"],
  },
  // Generic Trump mention that didn't trigger the specific red rules
  // above — still worth surfacing as an orange watch because his
  // headlines frequently become market-moving within hours. Put last
  // so the red rules above always win when more specific keywords hit.
  {
    keywords: [/\bTrump\b/i, /\bDonald Trump\b/i, /\bWhite House\b/i, /\bOval Office\b/i],
    severity: "orange",
    category: "geopolitical",
    symbols: ["EURUSD", "USDJPY", "XAUUSD", "US30", "US500", "NAS100"],
  },
  // Broader geopolitical keywords that don't name a specific actor but
  // historically move safe-haven and risk assets.
  {
    keywords: [
      /\bNATO\b/i, /\bUN Security Council\b/i, /\bGeneva\b.*\btalks\b/i,
      /\bsummit\b/i, /\bdiplomat(?:ic|s)\b/i, /\bembassy\b/i,
    ],
    severity: "orange",
    category: "geopolitical",
    symbols: ["XAUUSD", "USOIL", "EURUSD", "US500"],
  },
];

export interface ScoreResult {
  severity: Severity;
  category: Category;
  symbols: string[];
  matchedRule: string | null;
}

export function scoreHeadline(headline: string, summary?: string | null): ScoreResult {
  const text = `${headline} ${summary ?? ""}`;
  for (const rule of RULES) {
    for (const k of rule.keywords) {
      if (k.test(text)) {
        return {
          severity: rule.severity,
          category: rule.category,
          symbols: rule.symbols,
          matchedRule: k.source,
        };
      }
    }
  }
  return { severity: "green", category: "general", symbols: [], matchedRule: null };
}

// Map the FundamentalEvent impact string to our severity pallette.
export function impactToSeverity(impact: string): Severity {
  if (impact === "high") return "red";
  if (impact === "medium") return "orange";
  return "green";
}
