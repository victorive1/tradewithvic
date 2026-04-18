import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateProfile } from "@/lib/community/current-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const profile = await getOrCreateProfile(req);
  if (!profile) return NextResponse.json({ error: "no_user_key" }, { status: 400 });
  return NextResponse.json(profile);
}

export async function PATCH(req: NextRequest) {
  const profile = await getOrCreateProfile(req);
  if (!profile) return NextResponse.json({ error: "no_user_key" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const patch: any = {};
  if (typeof body.displayName === "string" && body.displayName.trim().length > 0 && body.displayName.length < 60) {
    patch.displayName = body.displayName.trim();
  }
  if (typeof body.username === "string" && /^[a-z0-9_]{3,20}$/.test(body.username)) {
    const collision = await prisma.communityProfile.findFirst({
      where: { username: body.username, NOT: { id: profile.id } },
    });
    if (collision) return NextResponse.json({ error: "username_taken" }, { status: 409 });
    patch.username = body.username;
  }
  if (typeof body.bio === "string" && body.bio.length < 280) patch.bio = body.bio;
  if (typeof body.avatarEmoji === "string" && body.avatarEmoji.length <= 6) patch.avatarEmoji = body.avatarEmoji;
  if (typeof body.tradingStyle === "string" && body.tradingStyle.length < 40) patch.tradingStyle = body.tradingStyle;
  if (Array.isArray(body.favoriteMarkets)) patch.favoriteMarketsJson = JSON.stringify(body.favoriteMarkets.slice(0, 12));

  const updated = await prisma.communityProfile.update({ where: { id: profile.id }, data: patch });
  return NextResponse.json(updated);
}
