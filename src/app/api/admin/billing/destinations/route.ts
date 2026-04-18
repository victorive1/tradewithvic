import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminBillingAuthorized } from "@/lib/billing/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const destinations = await prisma.cryptoDestination.findMany({
    where: { ownerScope: "business" },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ destinations });
}

export async function POST(req: NextRequest) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { currencyCode, destinationType, walletAddressRef, processorAccountRef, network, nickname } = body ?? {};
  if (typeof currencyCode !== "string") return NextResponse.json({ error: "missing_currency" }, { status: 400 });
  if (destinationType !== "wallet_address" && destinationType !== "processor_account") return NextResponse.json({ error: "invalid_destination_type" }, { status: 400 });

  const existing = await prisma.cryptoDestination.count({
    where: { ownerScope: "business", currencyCode, isActive: true },
  });

  const created = await prisma.cryptoDestination.create({
    data: {
      ownerScope: "business",
      ownerKey: null,
      currencyCode,
      destinationType,
      walletAddressRef: walletAddressRef ?? null,
      processorAccountRef: processorAccountRef ?? null,
      network: network ?? null,
      nickname: nickname ?? null,
      isDefault: existing === 0,
    },
  });
  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  await prisma.cryptoDestination.update({ where: { id }, data: { isActive: false, isDefault: false } });
  return NextResponse.json({ ok: true });
}
