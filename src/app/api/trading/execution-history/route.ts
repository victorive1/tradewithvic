import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUserKey } from "@/lib/trading/user-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const userKey = readUserKey(req);
  if (!userKey) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const take = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get("take") ?? 50)));
  const accountId = req.nextUrl.searchParams.get("accountId");
  const status = req.nextUrl.searchParams.get("status");

  const requests = await prisma.tradeExecutionRequest.findMany({
    where: {
      userKey,
      ...(accountId ? { accountId } : {}),
      ...(status ? { status } : {}),
    },
    include: { result: true, account: { select: { accountLabel: true, accountLogin: true, brokerName: true, platformType: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({ requests });
}
