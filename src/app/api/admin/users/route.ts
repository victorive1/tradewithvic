import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { isRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, "admin");
  if (gate instanceof NextResponse) return gate;

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ users });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireRole(req, "admin");
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const { userId, role } = body ?? {};

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }
  if (!isRole(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  // Don't let an admin demote themselves — easy to lock the whole system out
  // on a single click. They can still change role by having another admin do it.
  if (userId === gate.id && role !== "admin") {
    return NextResponse.json({ error: "cannot_demote_self" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, name: true, role: true },
  });
  return NextResponse.json({ user: updated });
}
