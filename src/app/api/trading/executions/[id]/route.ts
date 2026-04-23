import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUserKey } from "@/lib/trading/user-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userKey = readUserKey(req);
  if (!userKey) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const { id } = await params;
  const request = await prisma.tradeExecutionRequest.findUnique({
    where: { id },
    include: {
      result: true,
      audit: { orderBy: { createdAt: "asc" } },
      account: true,
    },
  });
  if (!request || request.userKey !== userKey) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const setupId = request.sourceRef ?? null;

  const [setup, decisionLog, algoExec, order] = await Promise.all([
    setupId
      ? prisma.tradeSetup.findUnique({ where: { id: setupId } }).catch(() => null)
      : Promise.resolve(null),
    setupId
      ? prisma.setupDecisionLog
          .findFirst({ where: { setupId }, orderBy: { createdAt: "desc" } })
          .catch(() => null)
      : Promise.resolve(null),
    findAlgoExecution(request.id, setupId, request.account?.accountLogin ?? null),
    setupId
      ? prisma.executionOrder
          .findUnique({
            where: { setupId },
            include: {
              position: { include: { events: { orderBy: { createdAt: "asc" } } } },
            },
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const position = order?.position ?? null;
  const trade = position
    ? await prisma.executionTrade
        .findUnique({ where: { positionId: position.id } })
        .catch(() => null)
    : null;

  const algoConfig = algoExec
    ? await prisma.algoBotConfig
        .findUnique({ where: { id: algoExec.algoBotConfigId } })
        .catch(() => null)
    : null;

  return NextResponse.json({
    request,
    setup,
    decisionLog,
    algoExecution: algoExec
      ? {
          ...algoExec,
          botLabel: algoConfig?.botId ?? algoExec.botId,
        }
      : null,
    order: order ? stripPosition(order) : null,
    position,
    trade,
    events: position?.events ?? [],
  });
}

async function findAlgoExecution(
  tradeRequestId: string,
  setupId: string | null,
  accountLogin: string | null,
) {
  const byRequest = await prisma.algoBotExecution
    .findFirst({ where: { tradeRequestId } })
    .catch(() => null);
  if (byRequest) return byRequest;
  if (!setupId) return null;
  return prisma.algoBotExecution
    .findFirst({
      where: {
        setupId,
        ...(accountLogin ? { accountLogin } : {}),
      },
      orderBy: { routedAt: "desc" },
    })
    .catch(() => null);
}

function stripPosition<T extends { position?: unknown }>(order: T): Omit<T, "position"> {
  const { position: _omit, ...rest } = order;
  return rest;
}
