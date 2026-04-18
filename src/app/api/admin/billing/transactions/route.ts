import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminBillingAuthorized } from "@/lib/billing/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const status = sp.get("status");
  const userKey = sp.get("userKey");
  const take = Math.min(500, parseInt(sp.get("take") ?? "100"));

  const transactions = await prisma.billingTransaction.findMany({
    where: {
      ...(type ? { transactionType: type } : {}),
      ...(status ? { status } : {}),
      ...(userKey ? { userKey } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json({ transactions });
}
