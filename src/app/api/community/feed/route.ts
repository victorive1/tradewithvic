import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateProfile } from "@/lib/community/current-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const me = await getOrCreateProfile(req);
  const tab = req.nextUrl.searchParams.get("tab") ?? "foryou";
  const take = 40;

  let whereAuthor: any = undefined;
  if (tab === "following" && me) {
    const follows = await prisma.communityFollow.findMany({ where: { followerId: me.id }, select: { followingId: true } });
    const ids = follows.map((f: any) => f.followingId);
    if (ids.length === 0) {
      return NextResponse.json({ posts: [], reactions: {}, tab, empty: "no_follows" });
    }
    whereAuthor = { authorId: { in: ids } };
  }

  // For You / Live / Ideas — simple v1 ranking: recency + reaction-weighted score.
  // Trade ideas tab filters by type === "idea".
  const baseWhere: any = { ...whereAuthor };
  if (tab === "ideas") baseWhere.type = "idea";

  const posts = await prisma.communityPost.findMany({
    where: baseWhere,
    orderBy: { createdAt: "desc" },
    take,
    include: { author: true },
  });

  // Compute a tiny engagement score for non-chronological tabs
  if (tab === "foryou" || tab === "trending") {
    posts.sort((a: any, b: any) => {
      const reactionScoreA = Object.values(safeParse(a.reactionCountsJson, {}) as Record<string, number>).reduce((s, v) => s + v, 0);
      const reactionScoreB = Object.values(safeParse(b.reactionCountsJson, {}) as Record<string, number>).reduce((s, v) => s + v, 0);
      const ageHoursA = (Date.now() - a.createdAt.getTime()) / 3600_000;
      const ageHoursB = (Date.now() - b.createdAt.getTime()) / 3600_000;
      const scoreA = reactionScoreA + (a.commentCount ?? 0) * 2 + Math.max(0, 12 - ageHoursA);
      const scoreB = reactionScoreB + (b.commentCount ?? 0) * 2 + Math.max(0, 12 - ageHoursB);
      return scoreB - scoreA;
    });
  }

  // Also return which reactions *I* have given to these posts
  const myReactions: Record<string, string[]> = {};
  if (me && posts.length > 0) {
    const reactions = await prisma.communityReaction.findMany({
      where: { authorId: me.id, postId: { in: posts.map((p: any) => p.id) } },
      select: { postId: true, reaction: true },
    });
    for (const r of reactions) {
      if (!myReactions[r.postId]) myReactions[r.postId] = [];
      myReactions[r.postId].push(r.reaction);
    }
  }

  return NextResponse.json({ posts, reactions: myReactions, tab, me: me ? { id: me.id, username: me.username, displayName: me.displayName, avatarEmoji: me.avatarEmoji } : null });
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
