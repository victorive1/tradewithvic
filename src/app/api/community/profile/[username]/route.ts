import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateProfile } from "@/lib/community/current-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const profile = await prisma.communityProfile.findUnique({
    where: { username },
    include: {
      posts: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const me = await getOrCreateProfile(req);
  let isFollowing = false;
  if (me && me.id !== profile.id) {
    const follow = await prisma.communityFollow.findUnique({
      where: { followerId_followingId: { followerId: me.id, followingId: profile.id } },
    });
    isFollowing = !!follow;
  }

  return NextResponse.json({
    ...profile,
    favoriteMarkets: safeParse(profile.favoriteMarketsJson, []),
    isFollowing,
    isSelf: me?.id === profile.id,
  });
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
