import { NextResponse } from "next/server";
import { createConversation, getConversation, processMessage, rateConversation } from "@/lib/chatbot/conversation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const convId = searchParams.get("id");

  if (convId) {
    const conv = getConversation(convId);
    if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    return NextResponse.json({ success: true, conversation: conv });
  }

  // Create new conversation
  const conv = createConversation();
  return NextResponse.json({ success: true, conversation: conv });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { conversationId, message, attachments, action } = body;

    if (action === "rate") {
      const success = rateConversation(conversationId, body.rating);
      return NextResponse.json({ success });
    }

    if (!conversationId || !message) {
      return NextResponse.json({ error: "conversationId and message required" }, { status: 400 });
    }

    const response = processMessage(conversationId, message, attachments);
    const conv = getConversation(conversationId);

    return NextResponse.json({
      success: true,
      response,
      currentAgent: conv?.currentAgent,
      escalated: conv?.escalated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
