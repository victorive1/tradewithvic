import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateProfile } from "@/lib/community/current-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const me = await getOrCreateProfile(req);
  if (!me) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const targetUsername = typeof body.username === "string" ? body.username : null;
  const targetId = typeof body.targetId === "string" ? body.targetId : null;
  if (!targetUsername && !targetId) return NextResponse.json({ error: "missing_target" }, { status: 400 });

  const target = targetId
    ? await prisma.communityProfile.findUnique({ where: { id: targetId } })
    : await prisma.communityProfile.findUnique({ where: { username: targetUsername! } });

  if (!target) return NextResponse.json({ error: "target_not_found" }, { status: 404 });
  if (target.id === me.id) return NextResponse.json({ error: "cannot_follow_self" }, { status: 400 });

  const existing = await prisma.communityFollow.findUnique({
    where: { followerId_followingId: { followerId: me.id, followingId: target.id } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.communityFollow.delete({ where: { id: existing.id } }),
      prisma.communityProfile.update({ where: { id: me.id }, data: { followingCount: { decrement: 1 } } }),
      prisma.communityProfile.update({ where: { id: target.id }, data: { followerCount: { decrement: 1 } } }),
    ]);
    return NextResponse.json({ following: false });
  }

  await prisma.$transaction([
    prisma.communityFollow.create({ data: { followerId: me.id, followingId: target.id } }),
    prisma.communityProfile.update({ where: { id: me.id }, data: { followingCount: { increment: 1 } } }),
    prisma.communityProfile.update({ where: { id: target.id }, data: { followerCount: { increment: 1 } } }),
  ]);
  return NextResponse.json({ following: true });
}
