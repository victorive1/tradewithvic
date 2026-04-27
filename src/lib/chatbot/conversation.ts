// TradeWithVic AI Chatbot — Stateless response engine.
//
// Why stateless: this used to keep an in-memory `Map<convId, Conversation>`
// on the server, which works in dev but breaks on Vercel — different requests
// hit different Lambda instances, so the GET that creates the conversation
// and the POST that sends a message frequently land on different VMs and the
// POST throws "Conversation not found", returning 500. The client renders no
// reply and the chat looks dead.
//
// Conversation state now lives on the client (ChatWidget). The server's only
// job is: given the prior message list + current agent + the new user
// message, compute the next assistant turn (plus any system messages emitted
// by the routing/escalation rules) and return them.

import { classifyAgent, shouldEscalate, agents, type AgentId } from "./agents";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent?: AgentId;
  agentName?: string;
  timestamp: string;
  attachments?: { type: "image" | "audio"; url: string; transcription?: string }[];
}

export interface ConversationState {
  messages: ChatMessage[];
  currentAgent: AgentId;
  escalated: boolean;
}

export interface TurnResult {
  // New messages emitted by the server this turn — append these to the
  // client's local list. May include a routing system message, the
  // assistant reply, or an escalation system message. Does NOT include
  // the user message; the client adds that optimistically.
  newMessages: ChatMessage[];
  // Updated conversation-level state.
  currentAgent: AgentId;
  escalated: boolean;
}

let msgCounter = 0;
function genMsgId() { return `msg_${Date.now()}_${++msgCounter}`; }

export function initialGreeting(): { message: ChatMessage; currentAgent: AgentId } {
  return {
    message: {
      id: genMsgId(),
      role: "assistant",
      content: "Hi! I'm the TradeWithVic assistant. How can I help you today? I can answer questions about the platform, trading tools, your account, or help you navigate any feature.",
      agent: "base",
      agentName: agents.base.name,
      timestamp: new Date().toISOString(),
    },
    currentAgent: "base",
  };
}

const knowledgeBase: Record<string, string> = {
  "market radar": "The Market Radar is your main dashboard. It shows live prices for all supported instruments (forex, metals, indices, crypto), currency strength rankings, top movers, and market pulse. It refreshes every 60 seconds with real-time data from TwelveData.",
  "trade setups": "Trade Setups are automatically generated trading ideas based on real market data. Each setup includes: direction (buy/sell), entry price, stop loss, take profit, risk/reward ratio, confidence score (0-100), and quality grade (A+ to C). Only setups with strong confluence are shown.",
  "currency strength": "The Currency Strength Meter ranks 8 major currencies (USD, EUR, GBP, JPY, CHF, AUD, CAD, NZD) by relative strength. It calculates strength from cross-pair price movements. Use it to find the strongest vs weakest pair opportunities.",
  "candlestick": "A candlestick shows 4 price points: Open, High, Low, Close. Green/bullish candle = close above open (buyers won). Red/bearish candle = close below open (sellers won). The body shows the range between open and close. Wicks show the high and low.",
  "support resistance": "Support is a price level where buying pressure tends to prevent further decline. Resistance is where selling pressure tends to prevent further rise. The S/R Engine auto-detects these levels and ranks them by strength, recency, and reaction count.",
  "liquidity": "Liquidity zones are areas where stop losses cluster. Market makers and institutions often push price to these zones to trigger stops before reversing. The Liquidity Map shows buy-side liquidity (above price) and sell-side liquidity (below price).",
  "algo": "The Algo Trading Hub lets you automate trading strategies. You can select strategies, set lot sizes, define risk rules, and let the system execute trades automatically. It supports multiple modes: Full Auto, Semi Auto, Paper Trade, and Demo Only.",
  "watchlist": "Your Watchlist lets you pin your favorite instruments for quick access. Add any of our 22 supported instruments and see live prices, daily changes, and trend direction at a glance.",
  "alerts": "Smart Alerts notify you when important market conditions occur: liquidity sweeps, new trade setups, volatility spikes, price levels hit, or economic events approaching. You can customize which alerts you receive.",
  "sign up": "To create an account, go to tradewithvic.com/auth/signup. Enter your name, email, and create a password (min 8 characters). You can also sign up with Google.",
  "sign in": "To sign in, go to tradewithvic.com/auth/signin. Enter your username or email and password. Your admin account username is your registered username.",
  "theme": "You can switch between dark and light mode using the sun/moon toggle button in the top-right corner of the dashboard header. Your preference is saved automatically.",
  "engulfing": "The Engulfing Detector uses the EPS (Engulfing Probability Score) formula: EPS = (LQ × 0.30) + (LOC × 0.25) + (MOM × 0.20) + (VOL × 0.15) + (TIME × 0.10). Scores above 0.75 are high probability. It only shows engulfing candles at key levels with liquidity context.",
  "breakout": "The Major Breakouts scanner detects high-confidence breakouts across all markets. It identifies structure, momentum, range, retest, trendline, FVG, session, and order block breakouts. Each breakout is scored and graded A+ to B+.",
  "sharp money": "The Sharp Money Tracker detects institutional activity. It scores each market for smart money flow based on liquidity sweeps, rejection patterns, and institutional accumulation/distribution behavior.",
  "risk calculator": "The Position Risk Calculator helps you determine lot size based on your account balance, risk percentage, entry price, and stop loss. It shows dollar risk, lot size, pip value, and risk/reward ratio.",
};

function findAnswer(message: string): string | null {
  const lower = message.toLowerCase();
  for (const [key, answer] of Object.entries(knowledgeBase)) {
    if (lower.includes(key)) return answer;
  }
  return null;
}

export function processTurn(
  state: ConversationState,
  userMessage: string,
  attachments?: ChatMessage["attachments"],
): TurnResult {
  const newMessages: ChatMessage[] = [];
  let { currentAgent, escalated } = state;
  // priorMessageCount is what shouldEscalate looked at: total length AFTER the
  // user message has been appended. Original code added the user message before
  // calling shouldEscalate, so we mirror that count.
  const priorMessageCount = state.messages.length + 1;

  // Escalation short-circuit: if user asks for human / repeats frustration /
  // conversation has gone on too long, drop into escalation mode and bail.
  if (shouldEscalate(userMessage, priorMessageCount)) {
    escalated = true;
    newMessages.push({
      id: genMsgId(),
      role: "system",
      content: "This conversation has been flagged for human review. A support team member will follow up within 24 hours. Your conversation transcript has been saved.",
      timestamp: new Date().toISOString(),
    });
    return { newMessages, currentAgent, escalated };
  }

  // Specialist routing — emit a system message when the agent changes.
  const suggestedAgent = classifyAgent(userMessage);
  if (suggestedAgent !== currentAgent && suggestedAgent !== "base") {
    currentAgent = suggestedAgent;
    const agent = agents[suggestedAgent];
    newMessages.push({
      id: genMsgId(),
      role: "system",
      content: `Connecting you with ${agent.name}, our ${agent.role.toLowerCase()}...`,
      timestamp: new Date().toISOString(),
    });
  }

  // Build the assistant reply.
  const knowledgeAnswer = findAnswer(userMessage);
  let responseContent: string;

  if (knowledgeAnswer) {
    responseContent = knowledgeAnswer;
  } else if (attachments?.some((a) => a.type === "image")) {
    responseContent = "I can see you've shared an image. Let me take a look... I can see what appears to be a trading chart or screenshot. Could you tell me specifically what you'd like help with regarding this image? For example: identifying patterns, understanding levels, or troubleshooting a display issue.";
  } else if (attachments?.some((a) => a.type === "audio")) {
    const transcript = attachments.find((a) => a.type === "audio")?.transcription;
    if (transcript) {
      responseContent = `I've transcribed your voice message: "${transcript}"\n\nLet me help with that. `;
      const audioAnswer = findAnswer(transcript);
      if (audioAnswer) responseContent += audioAnswer;
      else responseContent += "Could you provide a bit more detail so I can give you the most accurate answer?";
    } else {
      responseContent = "I received your audio message. I'm processing the transcription now. In the meantime, feel free to type your question if you'd prefer.";
    }
  } else {
    const lower = userMessage.toLowerCase();
    if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
      responseContent = "Hello! Welcome to TradeWithVic. How can I help you today? You can ask me about any feature, tool, or trading concept.";
    } else if (lower.includes("how does") || lower.includes("what is") || lower.includes("explain")) {
      responseContent = `That's a great question. Let me explain...\n\nTradeWithVic offers comprehensive trading intelligence across forex, metals, indices, and crypto. Could you be more specific about which feature or concept you'd like me to explain? For example:\n\n• Market Radar & live data\n• Trade Setups & scoring\n• Currency Strength\n• Algo Trading\n• Liquidity & Smart Money\n• Any specific tool or page`;
    } else if (lower.includes("thank")) {
      responseContent = "You're welcome! Is there anything else I can help you with?";
    } else {
      responseContent = `I understand you're asking about "${userMessage.slice(0, 50)}${userMessage.length > 50 ? "..." : ""}". Let me help with that.\n\nHere are some things I can assist with:\n• **Platform features** — how any tool or page works\n• **Trading concepts** — candlesticks, support/resistance, trends\n• **Account help** — signing in, settings, preferences\n• **Technical support** — issues with signals, bots, or charts\n\nCould you tell me more specifically what you need help with?`;
    }
  }

  newMessages.push({
    id: genMsgId(),
    role: "assistant",
    content: responseContent,
    agent: currentAgent,
    agentName: agents[currentAgent].name,
    timestamp: new Date().toISOString(),
  });

  return { newMessages, currentAgent, escalated };
}
