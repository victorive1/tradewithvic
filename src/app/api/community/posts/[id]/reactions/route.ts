import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateProfile } from "@/lib/community/current-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED = new Set(["like", "fire", "eyes", "bullish", "bearish", "clap", "rocket"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateProfile(req);
  if (!me) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reaction = typeof body.reaction === "string" ? body.reaction : null;
  if (!reaction || !ALLOWED.has(reaction)) return NextResponse.json({ error: "invalid_reaction" }, { status: 400 });

  const post = await prisma.communityPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "post_not_found" }, { status: 404 });

  const existing = await prisma.communityReaction.findUnique({
    where: { postId_authorId_reaction: { postId: id, authorId: me.id, reaction } },
  });

  const counts = safeParse(post.reactionCountsJson, {} as Record<string, number>);
  if (existing) {
    counts[reaction] = Math.max(0, (counts[reaction] ?? 0) - 1);
    await prisma.$transaction([
      prisma.communityReaction.delete({ where: { id: existing.id } }),
      prisma.communityPost.update({ where: { id }, data: { reactionCountsJson: JSON.stringify(counts) } }),
    ]);
    return NextResponse.json({ reacted: false, counts });
  }

  counts[reaction] = (counts[reaction] ?? 0) + 1;
  await prisma.$transaction([
    prisma.communityReaction.create({ data: { postId: id, authorId: me.id, reaction } }),
    prisma.communityPost.update({ where: { id }, data: { reactionCountsJson: JSON.stringify(counts) } }),
  ]);
  return NextResponse.json({ reacted: true, counts });
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
