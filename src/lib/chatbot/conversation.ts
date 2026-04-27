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
import { STRATEGY_BLUEPRINT_SCHEMA, isStrategyBlueprint, type StrategyBlueprint } from "./strategy";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent?: AgentId;
  agentName?: string;
  timestamp: string;
  attachments?: { type: "image" | "audio"; url: string; transcription?: string }[];
  // Structured payloads for rich rendering. Optional — text-only messages
  // omit this. Adding new variants is a discriminated union extension.
  structured?: { type: "strategy"; data: StrategyBlueprint };
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
  sessionId?: string;
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

// Substring matches against a lowercased message. Smoke-test caught the
// prior list missing "speak to a human" (we only had "talk to a human")
// and "isn't helpful" (we only had "not helpful"). Expanded to the
// natural-language variants traders actually type when they're frustrated.
const ESCALATION_PHRASES = [
  "speak to someone", "speak to a human", "speak to a person", "speak with someone",
  "talk to someone", "talk to a human", "talk to a person", "talk to support",
  "real person", "actual person", "human support",
  "not helpful", "isn't helpful", "isnt helpful", "this isn't working", "this isnt working",
  "still confused", "i'm confused", "im confused",
  "doesn't make sense", "doesnt make sense",
  "escalate", "escalation", "manager", "supervisor",
  "open a ticket", "file a ticket",
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
// the SDK (it accepts them). Image attachments on prior user turns are
// preserved so multi-turn discussions about the same chart still work.
function toAnthropicMessages(history: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of history) {
    if (m.role === "system") continue;
    const images = m.attachments?.filter((a) => a.type === "image") ?? [];
    if ((!m.content || m.content.trim().length === 0) && images.length === 0) continue;

    if (images.length > 0 && m.role === "user") {
      const blocks: Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam> = [];
      for (const img of images) {
        const parsed = parseDataUrlImage(img.url);
        if (parsed) blocks.push(parsed);
      }
      if (m.content && m.content.trim().length > 0) {
        blocks.push({ type: "text", text: m.content });
      }
      if (blocks.length > 0) out.push({ role: "user", content: blocks });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

// Accept either a `data:image/...;base64,...` URL (what the widget sends) or
// a plain http(s) URL. Returns null on anything unparseable so we don't
// blow up the API call on a malformed attachment.
function parseDataUrlImage(url: string): Anthropic.ImageBlockParam | null {
  if (typeof url !== "string" || url.length === 0) return null;
  if (url.startsWith("data:")) {
    const match = url.match(/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,(.+)$/);
    if (!match) return null;
    const mediaType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        data: match[2],
      },
    };
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { type: "image", source: { type: "url", url } };
  }
  return null;
}

export async function processTurn(
  state: ConversationState,
  userMessage: string,
  attachments?: ChatMessage["attachments"],
  userId: string | null = null,
  sessionId: string | null = null,
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

  // 1. Intent classification — but force TRADE_REVIEW when the user uploads
  //    an image. A chart screenshot in the chat is unambiguously a trade-
  //    review request even if the accompanying text is vague ("thoughts?").
  const hasImage = (attachments ?? []).some((a) => a.type === "image" && typeof a.url === "string");
  const intent = hasImage ? "TRADE_REVIEW" : await classifyIntent(userMessage);

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

  // 3. Hydrate data context (live quote, recent setups, risk math, user prefs).
  const dataCtx = await buildDataContext(intent, userMessage, userId);
  const contextSuffix = renderDataContext(dataCtx);

  // 4. Build system prompt (frozen prefix + dynamic suffix).
  const cachedPrefix = getCachedPrefix();
  const dynamicSuffix = getDynamicSuffix(intent, currentAgent);

  // Compose history. The latest user turn includes the server-data block
  // appended; the rest of the history is preserved verbatim. When the user
  // uploads images, we send a multimodal content array (image blocks first,
  // then the text + data context) — Sonnet 4.6 reads them in order.
  const history = toAnthropicMessages(state.messages);
  const augmentedUserContent = (userMessage || "Please review this trade screenshot.") + contextSuffix;

  let currentUserTurn: Anthropic.MessageParam;
  const currentImages: Anthropic.ImageBlockParam[] = [];
  for (const a of attachments ?? []) {
    if (a.type !== "image") continue;
    const parsed = parseDataUrlImage(a.url);
    if (parsed) currentImages.push(parsed);
  }
  if (currentImages.length > 0) {
    currentUserTurn = {
      role: "user",
      content: [
        ...currentImages,
        { type: "text", text: augmentedUserContent },
      ],
    };
  } else {
    currentUserTurn = { role: "user", content: augmentedUserContent };
  }

  const messages: Anthropic.MessageParam[] = [...history, currentUserTurn];

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
  let structuredPayload: ChatMessage["structured"];
  let cacheStats: TurnResult["cacheStats"];

  // STRATEGY_BUILDER intent forces structured JSON output via the Messages
  // API's output_config.format. The user gets a typed StrategyBlueprint they
  // can render as a card / save / copy / export to bot config later.
  const structuredMode = intent === "STRATEGY_BUILDER";

  try {
    // The structured-output branch needs a higher token ceiling — strategy
    // blueprints are ~600–1500 output tokens including pseudocode.
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: structuredMode ? 4096 : 2048,
      system: [
        { type: "text", text: cachedPrefix, cache_control: { type: "ephemeral" } },
        { type: "text", text: dynamicSuffix },
      ],
      messages,
      ...(structuredMode
        ? {
            output_config: {
              format: {
                type: "json_schema" as const,
                schema: STRATEGY_BLUEPRINT_SCHEMA,
              },
            },
          }
        : {}),
    });

    const textOut = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (structuredMode) {
      // Try to parse the JSON the model returned. If it fails (rare with
      // schema enforcement), fall back to showing the raw text so the user
      // still gets value rather than a vague error.
      let blueprint: unknown;
      try { blueprint = JSON.parse(textOut); } catch { blueprint = null; }
      if (isStrategyBlueprint(blueprint)) {
        structuredPayload = { type: "strategy", data: blueprint };
        responseContent = `Here's your **${blueprint.name}** strategy. Tap any section to expand. The pseudocode is at the bottom.`;
      } else {
        responseContent = textOut.length > 0
          ? textOut
          : "I couldn't structure that strategy — try rephrasing with more specifics (timeframe, instrument, entry trigger).";
      }
    } else {
      responseContent = textOut.length > 0
        ? textOut
        : "I generated an empty response — that's a bug on my end. Could you rephrase or ask a follow-up?";
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

  newMessages.push({
    id: genMsgId(),
    role: "assistant",
    content: responseContent,
    agent: currentAgent,
    agentName: agents[currentAgent].name,
    timestamp: new Date().toISOString(),
    ...(structuredPayload ? { structured: structuredPayload } : {}),
  });

  // Persist for signed-in users. Anonymous users get the stateless flow only.
  // Failure to persist is non-fatal — the user still gets the reply this
  // turn; only their history won't be saved.
  let persistedSessionId: string | undefined;
  if (userId) {
    try {
      persistedSessionId = await persistTurn({
        sessionId,
        userId,
        userMessage,
        currentAgent,
        escalated,
        intent,
        newMessages,
      });
    } catch {
      // Swallow — log later if we want, but don't break the turn.
    }
  }

  return { newMessages, currentAgent, escalated, intent, sessionId: persistedSessionId, cacheStats };
}

interface PersistTurnArgs {
  sessionId: string | null;
  userId: string;
  userMessage: string;
  currentAgent: AgentId;
  escalated: boolean;
  intent: Intent;
  newMessages: ChatMessage[];
}

// Persist this turn's user message and any server-emitted assistant/system
// messages. Creates the ChatSession on the first turn (sessionId === null).
// We don't persist attachments — image base64 is too big for the row, and
// only matters for the active client state anyway.
async function persistTurn(args: PersistTurnArgs): Promise<string> {
  const { prisma } = await import("@/lib/prisma");
  let sid = args.sessionId;
  if (!sid) {
    const created = await prisma.chatSession.create({
      data: {
        userId: args.userId,
        title: args.userMessage.slice(0, 80),
        currentAgent: args.currentAgent,
        escalated: args.escalated,
      },
    });
    sid = created.id;
  } else {
    await prisma.chatSession.update({
      where: { id: sid },
      data: { currentAgent: args.currentAgent, escalated: args.escalated },
    });
  }

  // Insert user turn first so the order is preserved by createdAt.
  await prisma.chatSessionMessage.create({
    data: { sessionId: sid, role: "user", content: args.userMessage },
  });
  for (const m of args.newMessages) {
    await prisma.chatSessionMessage.create({
      data: {
        sessionId: sid,
        role: m.role,
        content: m.content,
        agent: m.agent,
        agentName: m.agentName,
        intent: m.role === "assistant" ? args.intent : null,
        structuredJson: m.structured ? JSON.stringify(m.structured) : null,
      },
    });
  }
  return sid;
}
