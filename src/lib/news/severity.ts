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
  {
    keywords: [
      /\bwar\b/i, /\binvasion\b/i, /\bstrike(?:s|d)?\b/i, /\bmissile(?:s)?\b/i,
      /\battack(?:s|ed)?\b/i, /\bsanction(?:s|ed)?\b/i, /\bceasefire\b/i,
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
