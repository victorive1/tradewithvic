import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { RISK_PROFILE_KEYS, RISK_PROFILES, diffForProfile, type RiskProfileKey } from "@/lib/brain/risk-profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const account = await prisma.executionAccount.findUnique({
    where: { name: "paper-default" },
    select: {
      riskProfile: true,
      riskPerTradePct: true,
      maxConcurrentPositions: true,
      maxDailyLossPct: true,
      allowedGrades: true,
    },
  });
  return NextResponse.json({
    current: account?.riskProfile ?? "balanced",
    account,
    profiles: [
      { key: "off", label: "Off / Custom", description: "Manual control — preset values not applied." },
      ...Object.values(RISK_PROFILES),
    ],
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "admin");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({})) as { profile?: string };
  const key = body.profile as RiskProfileKey | undefined;
  if (!key || !RISK_PROFILE_KEYS.includes(key)) {
    return NextResponse.json({ error: "invalid_profile", valid: RISK_PROFILE_KEYS }, { status: 400 });
  }

  const account = await prisma.executionAccount.findUnique({
    where: { name: "paper-default" },
    select: { id: true, riskPerTradePct: true, maxConcurrentPositions: true, maxDailyLossPct: true, allowedGrades: true },
  });
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 404 });

  const diff = key === "off" ? {} : diffForProfile(account, key);
  await prisma.executionAccount.update({
    where: { id: account.id },
    data: { riskProfile: key, ...diff },
  });

  return NextResponse.json({ applied: key, changedFields: Object.keys(diff) });
}
