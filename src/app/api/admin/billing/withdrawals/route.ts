import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminBillingAuthorized } from "@/lib/billing/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = req.nextUrl.searchParams.get("status");
  const rows = await prisma.withdrawalRequest.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ withdrawals: rows });
}
