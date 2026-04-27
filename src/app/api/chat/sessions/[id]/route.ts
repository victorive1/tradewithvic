// Load a single chat session by id (full transcript), or delete it. Both
// require the session to belong to the authenticated user.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteCtx) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const sess = await prisma.chatSession.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true, title: true, currentAgent: true, escalated: true,
      createdAt: true, updatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, role: true, content: true, agent: true, agentName: true,
          intent: true, structuredJson: true, createdAt: true,
        },
      },
    },
  });
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    success: true,
    session: {
      id: sess.id,
      title: sess.title,
      currentAgent: sess.currentAgent,
      escalated: sess.escalated,
      createdAt: sess.createdAt.toISOString(),
      updatedAt: sess.updatedAt.toISOString(),
      messages: sess.messages.map((m) => {
        let structured: unknown = null;
        if (m.structuredJson) {
          try { structured = JSON.parse(m.structuredJson); } catch { structured = null; }
        }
        return {
          id: m.id,
          role: m.role,
          content: m.content,
          agent: m.agent ?? undefined,
          agentName: m.agentName ?? undefined,
          intent: m.intent ?? undefined,
          structured: structured ?? undefined,
          timestamp: m.createdAt.toISOString(),
        };
      }),
    },
  });
}

export async function DELETE(_req: Request, { params }: RouteCtx) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  // Restrict deletion to the user's own sessions — defence in depth even
  // though the foreign key enforces userId association.
  // deleteMany with compound (id, userId) closes the TOCTOU race a
  // plain delete({where: {id}}) would leave open after the ownership
  // findFirst — see journal entries route for full rationale.
  const result = await prisma.chatSession.deleteMany({
    where: { id, userId: user.id },
  });
  if (result.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
