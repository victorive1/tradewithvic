import { NextResponse } from "next/server";
import { initialGreeting, processTurn, type ChatMessage } from "@/lib/chatbot/conversation";
import type { AgentId } from "@/lib/chatbot/agents";

export const dynamic = "force-dynamic";

// GET — returns the initial greeting + starting agent. The client owns
// the conversation state from this point forward.
export async function GET() {
  const { message, currentAgent } = initialGreeting();
  return NextResponse.json({
    success: true,
    initialMessage: message,
    currentAgent,
  });
}

// POST — stateless turn handler. Accepts the prior conversation state
// in the body (so any Lambda instance can serve any user) and returns
// the new server-emitted messages plus updated agent/escalation flags.
//
// Action variants:
//   { messages, currentAgent, escalated, message, attachments? } → "next turn"
//   { action: "rate", rating } → ack only (rating is client-side now)
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "rate") {
      // Rating used to mutate the in-memory conversation; with stateless
      // state that's a client-side concern. Acknowledge so the UI flow
      // stays unchanged. If we ever want to persist ratings, hook a DB
      // write here.
      return NextResponse.json({ success: true });
    }

    const message: string | undefined = body.message;
    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const currentAgent: AgentId = (body.currentAgent as AgentId) ?? "base";
    const escalated: boolean = !!body.escalated;
    const attachments = body.attachments;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const result = processTurn(
      { messages, currentAgent, escalated },
      message,
      attachments,
    );

    return NextResponse.json({
      success: true,
      newMessages: result.newMessages,
      currentAgent: result.currentAgent,
      escalated: result.escalated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
