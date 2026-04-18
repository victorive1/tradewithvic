import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminBillingAuthorized } from "@/lib/billing/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_SETTINGS = [
  { paymentMethodKey: "card_usd", isEnabled: true, minAmount: 10, maxAmount: 50000 },
  { paymentMethodKey: "crypto_btc", isEnabled: true, minAmount: 25, maxAmount: 100000 },
  { paymentMethodKey: "crypto_eth", isEnabled: true, minAmount: 25, maxAmount: 100000 },
  { paymentMethodKey: "crypto_usdc", isEnabled: true, minAmount: 10, maxAmount: 100000 },
  { paymentMethodKey: "crypto_usdt", isEnabled: true, minAmount: 10, maxAmount: 100000 },
  { paymentMethodKey: "withdraw_bank", isEnabled: true, minAmount: 50, maxAmount: 25000 },
  { paymentMethodKey: "withdraw_crypto", isEnabled: true, minAmount: 50, maxAmount: 100000 },
];

async function ensureDefaults() {
  const count = await prisma.billingAdminSetting.count();
  if (count > 0) return;
  await prisma.billingAdminSetting.createMany({
    data: DEFAULT_SETTINGS.map((s) => ({
      ...s,
      feeRuleJson: JSON.stringify({ percent: 0, flat: 0 }),
      reviewRuleJson: JSON.stringify({}),
    })),
    skipDuplicates: true,
  });
}

export async function GET(req: NextRequest) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureDefaults();
  const settings = await prisma.billingAdminSetting.findMany({ orderBy: { paymentMethodKey: "asc" } });
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { paymentMethodKey, ...rest } = body ?? {};
  if (typeof paymentMethodKey !== "string") return NextResponse.json({ error: "missing_key" }, { status: 400 });

  const patch: any = {};
  if (typeof rest.isEnabled === "boolean") patch.isEnabled = rest.isEnabled;
  if (typeof rest.minAmount === "number") patch.minAmount = rest.minAmount;
  if (typeof rest.maxAmount === "number") patch.maxAmount = rest.maxAmount;
  if (rest.feeRule && typeof rest.feeRule === "object") patch.feeRuleJson = JSON.stringify(rest.feeRule);
  if (rest.reviewRule && typeof rest.reviewRule === "object") patch.reviewRuleJson = JSON.stringify(rest.reviewRule);

  const updated = await prisma.billingAdminSetting.upsert({
    where: { paymentMethodKey },
    create: { paymentMethodKey, ...patch, feeRuleJson: patch.feeRuleJson ?? "{}", reviewRuleJson: patch.reviewRuleJson ?? "{}" },
    update: patch,
  });
  return NextResponse.json(updated);
}
