// Intent classifier. Buckets each user message into one of the 13 intents
// from the blueprint so the orchestrator knows which data to fetch and which
// system-prompt section to emphasize.
//
// Two-tier strategy:
//   1. Cheap regex/keyword classifier handles the obvious cases at zero cost
//      and ~0ms latency (e.g. "what is a pip?" → FOREX_EDUCATION).
//   2. Anything ambiguous falls through to a single Haiku 4.5 call — the
//      cheapest, fastest Claude model — with a tight system prompt that
//      forces a one-token answer.
//
// The Haiku call adds ~300ms when triggered. If we wanted lower latency we
// could classify in parallel with the response generation, but for clarity
// we do it inline first and pass the resolved intent into the response stage.

import { getAnthropicClient } from "./anthropic-client";

export const INTENTS = [
  "GENERAL_QUESTION",
  "FOREX_EDUCATION",
  "LIVE_MARKET_ANALYSIS",
  "TECHNICAL_ANALYSIS",
  "FUNDAMENTAL_ANALYSIS",
  "RISK_CALCULATION",
  "SIGNAL_EXPLANATION",
  "TRADE_REVIEW",
  "STRATEGY_BUILDER",
  "PLATFORM_SUPPORT",
  "ACCOUNT_SUPPORT",
  "BROKER_EXECUTION_HELP",
  "NEWS_EXPLANATION",
] as const;
export type Intent = (typeof INTENTS)[number];

interface RuleMatch {
  intent: Intent;
  // Test if this rule matches a lowered, trimmed message.
  test: (msg: string) => boolean;
}

// Highest-precedence rules first — first match wins.
const RULES: RuleMatch[] = [
  {
    intent: "RISK_CALCULATION",
    test: (m) =>
      /\blot\s*size|position\s*siz|risk\s*\$|risk\s*\d+%|how\s+(many|much)\s+lots?|risk\s*(per|for)\s*trade/.test(m),
  },
  {
    intent: "PLATFORM_SUPPORT",
    test: (m) =>
      /\bhow\s+(do|to)\s+i\b.*\b(connect|sign\s*in|sign\s*up|use|find|navigate|access|enable|disable)|\bmt[45]\b|\bbroker\s+connect|telegram|notification|where\s+is/.test(m),
  },
  {
    intent: "ACCOUNT_SUPPORT",
    test: (m) =>
      /\bbilling|subscription|invoice|refund|cancel\s+plan|upgrade\s+plan|downgrade|payment|password|email|account\s+(type|status|tier)/.test(m),
  },
  {
    intent: "SIGNAL_EXPLANATION",
    test: (m) =>
      /\bwhy\s+(did|does|is)\s+(the\s+)?(bot|signal|setup|engine)|explain\s+(this\s+)?(signal|setup|trade\s*idea)|what\s+(does|is)\s+this\s+signal|signal\s+confidence|why\s+(buy|sell|long|short)/.test(m),
  },
  {
    intent: "TRADE_REVIEW",
    test: (m) =>
      /\b(was|is)\s+this\s+a?\s*(good|bad)\s+(trade|entry|setup)|review\s+(my|this)\s+trade|grade\s+my\s+trade|trade\s+quality|did\s+i\s+enter\s+(too\s+early|right)/.test(m),
  },
  {
    intent: "STRATEGY_BUILDER",
    // Smoke-test caught the prior regex requiring "strategy" immediately
    // after "build me a" — "build me an inverse FVG strategy" missed.
    // New shape: any of {build, create, design, generate} as a verb
    // anywhere before "strateg" within ~120 chars, OR explicit
    // "turn rules/idea into" / "rulebook" phrasings.
    test: (m) =>
      /\b(build|create|design|generate|make|write)\b[^.\n?]{0,120}\bstrateg/.test(m)
      || /\bturn\s+(my|this|these|the)\s+(idea|rules?|setup)\s+into/.test(m)
      || /\b(a\+|aplus)\s+(only\s+)?(rulebook|trading\s*rules)\b/.test(m)
      || /\bbacktest\s+(rules|plan|the\s+strategy)\b/.test(m)
      || /\brule\s*book\s+for\b/.test(m),
  },
  {
    intent: "LIVE_MARKET_ANALYSIS",
    test: (m) =>
      /\b(right\s+now|currently|today|this\s+morning|this\s+session)\b|what\s+is\s+(eur|gbp|usd|jpy|chf|aud|cad|nzd|btc|eth|xau|gold|oil|wti)|(bullish|bearish)\s+(now|today|right)|trending\s+(now|today)/.test(m),
  },
  {
    intent: "TECHNICAL_ANALYSIS",
    test: (m) =>
      /\bsupport|resistance|order\s*block|fair\s*value\s*gap|fvg|liquidity|sweep|choch|bos|vwap|volume\s*profile|market\s*structure|supply\s+and\s+demand|inverse\s*fvg/.test(m),
  },
  {
    intent: "FUNDAMENTAL_ANALYSIS",
    test: (m) =>
      /\bcpi|nfp|fomc|interest\s*rate|inflation|gdp|bond\s*yield|central\s*bank|fed\s+(meeting|decision)|ppi|pmi|retail\s*sales|unemployment/.test(m),
  },
  {
    intent: "NEWS_EXPLANATION",
    test: (m) =>
      /\b(news|headline)\s+(about|on|impact)|why\s+(is|did)\s+.*(drop|rise|crash|spike|rally|tank)|impact\s+of\s+the\s+news|what\s+happened/.test(m),
  },
  {
    intent: "FOREX_EDUCATION",
    test: (m) =>
      /\bwhat\s+is\s+(a\s+)?(pip|lot|spread|leverage|margin|swap|session|pip\s*value|tick|standard\s+lot|mini\s+lot|micro\s+lot)|explain\s+(pip|leverage|margin|spread|forex)|how\s+do\s+(pips|lots)\s+work/.test(m),
  },
  {
    intent: "BROKER_EXECUTION_HELP",
    test: (m) =>
      /\b(contract\s+size|tick\s+(size|value)|min(imum)?\s+lot|lot\s+step|broker\s+spec|symbol\s+suffix|\.ecn|\.raw|justmarkets|ic\s*markets|exness|pepperstone)/.test(m),
  },
];

function ruleClassify(message: string): Intent | null {
  const m = message.toLowerCase().trim();
  for (const rule of RULES) {
    if (rule.test(m)) return rule.intent;
  }
  return null;
}

const CLASSIFIER_SYSTEM = `You are an intent classifier for the TradeWithVic trading-platform assistant. You must classify the user's message into exactly ONE of these intents and respond with only the intent label — no explanation, no punctuation:

GENERAL_QUESTION — anything not specific to trading (greetings, productivity, etc.)
FOREX_EDUCATION — explain a forex concept (pips, lots, spreads, leverage, sessions)
LIVE_MARKET_ANALYSIS — current market state for a specific instrument right now
TECHNICAL_ANALYSIS — structure, S/R, order blocks, FVG, VWAP, liquidity concepts
FUNDAMENTAL_ANALYSIS — CPI/NFP/FOMC/rates/yields/central-bank policy
RISK_CALCULATION — lot size / position sizing / risk-per-trade math
SIGNAL_EXPLANATION — why a TradeWithVic signal or setup fired
TRADE_REVIEW — grade or critique a specific trade the user took
STRATEGY_BUILDER — turn a trading idea into rules, pseudocode, or a rulebook
PLATFORM_SUPPORT — how to use a TradeWithVic feature, page, or tool
ACCOUNT_SUPPORT — billing, subscription, login, account settings
BROKER_EXECUTION_HELP — broker contract specs, symbol suffixes, tick values
NEWS_EXPLANATION — what a news event means or why a market moved on news

Reply with ONLY the label.`;

export async function classifyIntent(message: string): Promise<Intent> {
  const ruleHit = ruleClassify(message);
  if (ruleHit) return ruleHit;

  const client = getAnthropicClient();
  if (!client) return "GENERAL_QUESTION";

  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 16,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: "user", content: message }],
    });
    const text = resp.content
      .filter((b): b is { type: "text"; text: string } & typeof b => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .toUpperCase();
    const found = INTENTS.find((i) => text.includes(i));
    return found ?? "GENERAL_QUESTION";
  } catch {
    // Classifier failure shouldn't block the response — degrade to general.
    return "GENERAL_QUESTION";
  }
}
