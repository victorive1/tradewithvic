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

  const setupIds = Array.from(new Set(requests.map((r) => r.sourceRef).filter((v): v is string => !!v)));
  const requestIds = requests.map((r) => r.id);

  const [setups, algoExecs] = await Promise.all([
    setupIds.length
      ? prisma.tradeSetup.findMany({
          where: { id: { in: setupIds } },
          select: { id: true, qualityGrade: true, confidenceScore: true },
        }).catch(() => [])
      : Promise.resolve([]),
    requestIds.length
      ? prisma.algoBotExecution.findMany({
          where: { tradeRequestId: { in: requestIds } },
          select: { tradeRequestId: true, botId: true, status: true },
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const setupById = new Map(setups.map((s) => [s.id, s]));
  const algoByRequest = new Map(
    algoExecs.filter((a) => a.tradeRequestId).map((a) => [a.tradeRequestId as string, a]),
  );

  const enriched = requests.map((r) => {
    const setup = r.sourceRef ? setupById.get(r.sourceRef) : undefined;
    const algo = algoByRequest.get(r.id);
    return {
      ...r,
      grade: setup?.qualityGrade ?? null,
      confidenceScore: setup?.confidenceScore ?? null,
      algoBotId: algo?.botId ?? null,
      algoStatus: algo?.status ?? null,
    };
  });

  return NextResponse.json({ requests: enriched });
}
