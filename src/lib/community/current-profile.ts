import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const USERKEY_HEADER = "x-community-user-key";
const USERKEY_COOKIE = "tradewithvic_community_user_key";

const ADJECTIVES = ["bull", "bear", "sharp", "swift", "steady", "bold", "quiet", "quick", "wise", "keen", "nova", "alpha"];
const NOUNS = ["trader", "hunter", "scanner", "macro", "chartist", "analyst", "sniper", "sentinel", "scout", "raven"];

function randomUsername(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${a}_${n}_${num}`;
}

export function readUserKey(req: NextRequest): string | null {
  const header = req.headers.get(USERKEY_HEADER);
  if (header) return header;
  const cookie = req.cookies.get(USERKEY_COOKIE)?.value;
  return cookie ?? null;
}

/**
 * Read the user key from the request, upsert (or create) the matching
 * CommunityProfile, and return it. Returns null if no userKey supplied.
 */
export async function getOrCreateProfile(req: NextRequest) {
  const userKey = readUserKey(req);
  if (!userKey) return null;
  let profile = await prisma.communityProfile.findUnique({ where: { userKey } });
  if (profile) return profile;
  // Create fresh profile with a generated username (user can rename later)
  let username = randomUsername();
  // Retry username on collision
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.communityProfile.findUnique({ where: { username } });
    if (!exists) break;
    username = randomUsername();
  }
  profile = await prisma.communityProfile.create({
    data: {
      userKey,
      username,
      displayName: username,
    },
  });
  return profile;
}
