import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDefaultMappings } from "@/lib/trading/symbol-mapping";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  await ensureDefaultMappings();

  const internalSymbol = req.nextUrl.searchParams.get("internalSymbol");
  const brokerName = req.nextUrl.searchParams.get("brokerName");

  const rules = await prisma.symbolMappingRule.findMany({
    where: {
      isActive: true,
      ...(internalSymbol ? { internalSymbol } : {}),
      ...(brokerName ? { OR: [{ brokerName }, { brokerName: null }] } : {}),
    },
    orderBy: [{ internalSymbol: "asc" }, { brokerName: "asc" }],
    take: 500,
  });

  return NextResponse.json({ rules });
}
