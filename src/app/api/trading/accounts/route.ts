import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUserKey } from "@/lib/trading/user-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const userKey = readUserKey(req);
  if (!userKey) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const accounts = await prisma.linkedTradingAccount.findMany({
    where: { userKey, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ accounts });
}

/**
 * Upsert a linked MT account. The UI posts the accounts it has cached in
 * localStorage so the server has persistent records to execute against.
 */
export async function POST(req: NextRequest) {
  const userKey = readUserKey(req);
  if (!userKey) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const platformType = String(body.platformType ?? "").toUpperCase();
  if (platformType !== "MT4" && platformType !== "MT5") {
    return NextResponse.json({ error: "invalid_platform" }, { status: 400 });
  }
  const brokerName = String(body.brokerName ?? "").trim();
  const serverName = String(body.serverName ?? "").trim();
  const accountLogin = String(body.accountLogin ?? "").trim();
  if (!brokerName || !serverName || !accountLogin) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const existing = await prisma.linkedTradingAccount.findFirst({
    where: { userKey, platformType, accountLogin, serverName },
  });

  const adapterKind = typeof body.adapterKind === "string" ? body.adapterKind : "pending_queue";

  const account = existing
    ? await prisma.linkedTradingAccount.update({
        where: { id: existing.id },
        data: {
          brokerName,
          accountLabel: body.accountLabel ?? existing.accountLabel,
          baseCurrency: body.baseCurrency ?? existing.baseCurrency,
          leverage: body.leverage ?? existing.leverage,
          connectionStatus: body.connectionStatus ?? existing.connectionStatus,
          adapterKind,
          adapterConfigJson: body.adapterConfigJson ?? existing.adapterConfigJson,
          isActive: true,
        },
      })
    : await prisma.linkedTradingAccount.create({
        data: {
          userKey,
          platformType,
          brokerName,
          serverName,
          accountLogin,
          accountLabel: body.accountLabel ?? null,
          baseCurrency: body.baseCurrency ?? "USD",
          leverage: body.leverage ?? null,
          connectionStatus: body.connectionStatus ?? "linked",
          adapterKind,
          adapterConfigJson: body.adapterConfigJson ?? null,
        },
      });

  return NextResponse.json({ account });
}

export async function DELETE(req: NextRequest) {
  const userKey = readUserKey(req);
  if (!userKey) return NextResponse.json({ error: "no_user_key" }, { status: 400 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const acct = await prisma.linkedTradingAccount.findUnique({ where: { id } });
  if (!acct || acct.userKey !== userKey) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await prisma.linkedTradingAccount.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
