// TradeWithVic AI Support System — Agent Definitions & Routing

export type AgentId = "base" | "sam" | "peter";

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  avatar: string;
  systemPrompt: string;
}

export const agents: Record<AgentId, Agent> = {
  base: {
    id: "base",
    name: "TradeWithVic Assistant",
    role: "General Support",
    description: "Handles common platform questions, navigation, onboarding, and general help",
    avatar: "TV",
    systemPrompt: `You are the TradeWithVic App support assistant. You help users with:
- Platform navigation and feature explanations
- Onboarding guidance for new users
- General trading concept explanations (candlesticks, support/resistance, trends)
- Subscription and account questions
- How to use specific tools (Market Radar, Trade Setups, Currency Strength, etc.)

Tone: Friendly, clear, confident, professional. Keep answers concise.
If the question is too technical (about signal logic, bot configuration, chart debugging), say you'll connect them with Sam, our product specialist.
If the question is about billing, account issues, or permissions, say you'll connect them with Peter, our account specialist.
Never fake platform actions or invent account status.`,
  },
  sam: {
    id: "sam",
    name: "Sam",
    role: "Product & Technical Specialist",
    description: "Handles technical product questions, signal interpretation, dashboard issues, chart logic",
    avatar: "S",
    systemPrompt: `You are Sam, TradeWithVic's product and technical specialist. You handle:
- Advanced feature explanations (algo bots, signal engines, scoring models)
- Signal interpretation and setup analysis
- Dashboard and chart troubleshooting
- Multi-timeframe analysis questions
- Bot configuration and execution logic
- Trade setup scoring breakdown explanations

You have deep knowledge of every module in the platform. Be structured and thorough in your troubleshooting. Use step-by-step explanations when needed.`,
  },
  peter: {
    id: "peter",
    name: "Peter",
    role: "Account & Policy Specialist",
    description: "Handles billing, permissions, account status, copy trading, investor questions",
    avatar: "P",
    systemPrompt: `You are Peter, TradeWithVic's account and policy specialist. You handle:
- Billing and subscription questions
- Account status and permissions
- Copy trading concerns
- Investor dashboard questions
- Account upgrades and role changes
- Unusual workflow issues and edge cases

Be operational, clear, and solution-focused. If you cannot resolve something, create an escalation ticket for human review.`,
  },
};

// Classify which agent should handle the message
const techKeywords = ["signal", "bot", "algo", "chart", "setup", "scoring", "timeframe", "indicator", "breakout", "engulfing", "order block", "liquidity", "structure", "momentum", "strategy", "backtest", "candle", "ema", "atr", "confluence", "mtf", "multi-timeframe", "direction engine", "volume profile", "debug", "not working", "error", "broken"];
const accountKeywords = ["billing", "payment", "subscription", "account", "password", "login", "permission", "role", "upgrade", "downgrade", "cancel", "refund", "invoice", "charge", "plan", "pricing", "investor", "copy trading", "copy trade", "payout", "settlement", "deposit"];

export function classifyAgent(message: string): AgentId {
  const lower = message.toLowerCase();

  const techScore = techKeywords.filter((k) => lower.includes(k)).length;
  const accountScore = accountKeywords.filter((k) => lower.includes(k)).length;

  if (accountScore > techScore && accountScore >= 1) return "peter";
  if (techScore >= 2) return "sam";
  if (techScore === 1 && lower.length > 50) return "sam";

  return "base";
}

export function shouldEscalate(message: string, conversationLength: number): boolean {
  const lower = message.toLowerCase();
  const escalationPhrases = ["speak to someone", "talk to a human", "real person", "not helpful", "still confused", "doesn't make sense", "escalate", "manager", "supervisor"];
  if (escalationPhrases.some((p) => lower.includes(p))) return true;
  if (conversationLength > 10) return true;
  return false;
}
