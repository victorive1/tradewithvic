import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateEa } from "@/lib/trading/ea-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Lightweight heartbeat for the EA. Any pull already updates
 * lastConnectedAt, but if there are no pending orders the EA can ping
 * this cheaply so the UI still shows it as live.
 *
 * Auth: x-ea-secret header.
 * Body: { accountLogin }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const accountLogin = String(body.accountLogin ?? "");
  const auth = await authenticateEa(req, accountLogin);
  if (!auth.ok) return auth.response;
  const account = auth.account!;

  const now = new Date();
  await prisma.linkedTradingAccount.update({
    where: { id: account.id },
    data: { lastConnectedAt: now, connectionStatus: "linked" },
  });

  return NextResponse.json({
    ok: true,
    serverTime: now.toISOString(),
    accountLogin: account.accountLogin,
  });
}
