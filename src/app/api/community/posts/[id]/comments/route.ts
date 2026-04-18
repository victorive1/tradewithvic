import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateProfile } from "@/lib/community/current-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const comments = await prisma.communityComment.findMany({
    where: { postId: id },
    orderBy: { createdAt: "asc" },
    include: { author: true },
    take: 200,
  });
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateProfile(req);
  if (!me) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const content = typeof body.body === "string" ? body.body.trim() : "";
  if (!content || content.length > 2000) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const parentId = typeof body.parentId === "string" ? body.parentId : null;

  const comment = await prisma.$transaction(async (tx: any) => {
    const created = await tx.communityComment.create({
      data: {
        postId: id,
        authorId: me.id,
        parentId,
        body: content,
      },
      include: { author: true },
    });
    await tx.communityPost.update({ where: { id }, data: { commentCount: { increment: 1 } } });
    return created;
  });

  return NextResponse.json(comment);
}
