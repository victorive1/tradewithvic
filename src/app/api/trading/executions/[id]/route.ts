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
  return NextResponse.json({ request });
}
