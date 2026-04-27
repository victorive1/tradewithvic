// TradeWithVic Intelligence Assistant — orchestrator.
//
// Pipeline per turn:
//   1. Classify intent (rules → Haiku 4.5 fallback for ambiguous)
//   2. Pick persona (Sam/Peter/base) from intent
//   3. Hydrate per-intent server data (live quote, recent setups, risk math)
//   4. Build TradeWithVic system prompt (cached prefix + intent suffix)
//   5. Call Sonnet 4.6 with the prior message history + augmented user turn
//   6. Return new assistant message + maybe a routing system message
//
// Stateless on the server — the client owns the conversation snapshot and
// posts it on every turn (see /api/chat/route.ts and ChatWidget.tsx).

import Anthropic from "@anthropic-ai/sdk";
import { agents, type AgentId } from "./agents";
import { classifyIntent, type Intent } from "./intent";
import { getAnthropicClient } from "./anthropic-client";
import { buildDataContext, renderDataContext } from "./data-context";
import { getCachedPrefix, getDynamicSuffix } from "./system-prompts";

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
  newMessages: ChatMessage[];
  currentAgent: AgentId;
  escalated: boolean;
  intent?: Intent;
  // Cache telemetry surfaced for ops monitoring (cache_read_input_tokens > 0 = working)
  cacheStats?: { read: number; written: number; input: number; output: number };
}

let msgCounter = 0;
function genMsgId() { return `msg_${Date.now()}_${++msgCounter}`; }

export function initialGreeting(): { message: ChatMessage; currentAgent: AgentId } {
  return {
    message: {
      id: genMsgId(),
      role: "assistant",
      content:
        "Hi — I'm the TradeWithVic Intelligence Assistant. I can explain forex concepts, read live market conditions, walk you through any platform feature, calculate risk, explain why a setup fired, or help you build a strategy. What's on your mind?",
      agent: "base",
      agentName: agents.base.name,
      timestamp: new Date().toISOString(),
    },
    currentAgent: "base",
  };
}

// Map intents to which persona answers. Sam handles deep technical /
// signal / strategy questions; Peter handles billing & policy; base handles
// the rest.
function pickAgentFor(intent: Intent, current: AgentId): AgentId {
  switch (intent) {
    case "SIGNAL_EXPLANATION":
    case "TECHNICAL_ANALYSIS":
    case "STRATEGY_BUILDER":
    case "TRADE_REVIEW":
    case "BROKER_EXECUTION_HELP":
      return "sam";
    case "ACCOUNT_SUPPORT":
      return "peter";
    case "RISK_CALCULATION":
    case "LIVE_MARKET_ANALYSIS":
    case "FUNDAMENTAL_ANALYSIS":
    case "FOREX_EDUCATION":
    case "PLATFORM_SUPPORT":
    case "NEWS_EXPLANATION":
    case "GENERAL_QUESTION":
    default:
      // Stay on the current persona if already specialized — avoids ping-ponging.
      return current;
  }
}

const ESCALATION_PHRASES = [
  "speak to someone", "talk to a human", "real person", "not helpful",
  "still confused", "doesn't make sense", "escalate", "manager", "supervisor",
];

function shouldEscalate(message: string, totalMessages: number): boolean {
  const lower = message.toLowerCase();
  if (ESCALATION_PHRASES.some((p) => lower.includes(p))) return true;
  if (totalMessages > 16) return true;
  return false;
}

// Convert client-side ChatMessage[] into the Anthropic Messages API shape.
// We strip system messages (server emits routing notes that aren't part of
// the model's context) and merge consecutive same-role turns implicitly via
// the SDK (it accepts them).
function toAnthropicMessages(history: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of history) {
    if (m.role === "system") continue;
    if (!m.content || m.content.trim().length === 0) continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export async function processTurn(
  state: ConversationState,
  userMessage: string,
  attachments?: ChatMessage["attachments"],
): Promise<TurnResult> {
  const newMessages: ChatMessage[] = [];
  let { currentAgent, escalated } = state;
  const priorMessageCount = state.messages.length + 1;

  // Escalation short-circuit — don't burn an LLM call.
  if (shouldEscalate(userMessage, priorMessageCount)) {
    escalated = true;
    newMessages.push({
      id: genMsgId(),
      role: "system",
      content:
        "This conversation has been flagged for human review. A support team member will follow up within 24 hours. Your conversation transcript has been saved.",
      timestamp: new Date().toISOString(),
    });
    return { newMessages, currentAgent, escalated };
  }

  // 1. Intent classification.
  const intent = await classifyIntent(userMessage);

  // 2. Persona routing — emit a system message if we change personas.
  const nextAgent = pickAgentFor(intent, currentAgent);
  if (nextAgent !== currentAgent) {
    currentAgent = nextAgent;
    const a = agents[nextAgent];
    newMessages.push({
      id: genMsgId(),
      role: "system",
      content: `Connecting you with ${a.name}, our ${a.role.toLowerCase()}…`,
      timestamp: new Date().toISOString(),
    });
  }

  // 3. Hydrate data context (live quote, recent setups, risk math).
  const dataCtx = await buildDataContext(intent, userMessage);
  const contextSuffix = renderDataContext(dataCtx);

  // 4. Build system prompt (frozen prefix + dynamic suffix).
  const cachedPrefix = getCachedPrefix();
  const dynamicSuffix = getDynamicSuffix(intent, currentAgent);

  // Compose history. The latest user turn includes the server-data block
  // appended; the rest of the history is preserved verbatim.
  const history = toAnthropicMessages(state.messages);
  const augmentedUserContent = userMessage + contextSuffix;
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: augmentedUserContent },
  ];

  // 5. Call the LLM.
  const client = getAnthropicClient();
  if (!client) {
    newMessages.push({
      id: genMsgId(),
      role: "assistant",
      content:
        "I'm not able to respond right now — the AI backend isn't configured (ANTHROPIC_API_KEY missing on the server). Tell an admin and try again in a few minutes.",
      agent: currentAgent,
      agentName: agents[currentAgent].name,
      timestamp: new Date().toISOString(),
    });
    return { newMessages, currentAgent, escalated, intent };
  }

  let responseContent: string;
  let cacheStats: TurnResult["cacheStats"];

  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      // Two-block system: long frozen prefix is cache_control'd; short dynamic
      // suffix sits after. Caches hit on every turn after the first.
      system: [
        { type: "text", text: cachedPrefix, cache_control: { type: "ephemeral" } },
        { type: "text", text: dynamicSuffix },
      ],
      messages,
    });

    responseContent = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!responseContent) {
      responseContent =
        "I generated an empty response — that's a bug on my end. Could you rephrase or ask a follow-up?";
    }

    cacheStats = {
      read: resp.usage.cache_read_input_tokens ?? 0,
      written: resp.usage.cache_creation_input_tokens ?? 0,
      input: resp.usage.input_tokens,
      output: resp.usage.output_tokens,
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      responseContent =
        "I'm getting rate-limited right now — please try again in a few seconds.";
    } else if (err instanceof Anthropic.AuthenticationError) {
      responseContent =
        "The AI backend rejected its API key. Tell an admin to rotate ANTHROPIC_API_KEY.";
    } else if (err instanceof Anthropic.BadRequestError) {
      responseContent =
        "Your message couldn't be processed (bad request). If you uploaded an attachment, try again with text only.";
    } else if (err instanceof Anthropic.APIError) {
      responseContent =
        `The AI backend returned an error (${err.status ?? "unknown"}). Try again in a moment.`;
    } else {
      responseContent =
        "Something went wrong on my side. Try again in a moment, or rephrase your question.";
    }
  }

  void attachments; // attachments aren't sent to LLM yet — Phase 2 (vision/trade review)

  newMessages.push({
    id: genMsgId(),
    role: "assistant",
    content: responseContent,
    agent: currentAgent,
    agentName: agents[currentAgent].name,
    timestamp: new Date().toISOString(),
  });

  return { newMessages, currentAgent, escalated, intent, cacheStats };
}
