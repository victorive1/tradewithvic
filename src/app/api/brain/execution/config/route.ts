import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// NOTE: currently open to all users per product direction. Re-lock later by
// adding an auth guard here (e.g., session check or ADMIN_REFRESH_SECRET).

async function ensureAccount() {
  const existing = await prisma.executionAccount.findUnique({ where: { name: "paper-default" } });
  if (existing) return existing;
  return prisma.executionAccount.create({ data: { name: "paper-default" } });
}

export async function GET(_req: NextRequest) {
  const account = await ensureAccount();
  return NextResponse.json(account);
}

const ALLOWED_MODES = new Set(["paper", "mt_shadow", "mt_live"]);
const ALLOWED_SMART_EXIT = new Set(["off", "conservative", "balanced", "aggressive"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const account = await ensureAccount();

  const patch: any = {};
  const numField = (k: string) => {
    if (typeof body[k] === "number" && Number.isFinite(body[k])) patch[k] = body[k];
  };
  const intField = (k: string) => {
    if (typeof body[k] === "number" && Number.isInteger(body[k])) patch[k] = body[k];
  };
  const boolField = (k: string) => {
    if (typeof body[k] === "boolean") patch[k] = body[k];
  };
  const strField = (k: string, allowed?: Set<string>) => {
    if (typeof body[k] === "string" && (!allowed || allowed.has(body[k]))) patch[k] = body[k];
  };
  const jsonArrayField = (k: string) => {
    if (Array.isArray(body[k])) patch[k] = JSON.stringify(body[k]);
  };

  numField("riskPerTradePct");
  numField("maxDailyLossPct");
  numField("weeklyLossLimitPct");
  numField("maxTotalRiskPct");
  numField("maxCurrencyExposurePct");
  numField("minRiskReward");
  intField("maxConcurrentPositions");
  intField("maxSameDirectionPositions");
  intField("maxSameAssetClassPositions");
  intField("maxSameStrategyPositions");
  intField("minConfidenceScore");
  boolField("autoExecuteEnabled");
  boolField("killSwitchEngaged");
  boolField("newsFilterEnabled");
  boolField("fridayCloseProtection");
  strField("smartExitMode", ALLOWED_SMART_EXIT);
  strField("executionMode", ALLOWED_MODES);
  jsonArrayField("allowedGrades");
  jsonArrayField("selectedSymbolsJson");
  jsonArrayField("allowedSessionsJson");
  jsonArrayField("selectedMtAccountIdsJson");

  // Rename shorthand keys that clients may send
  if (Array.isArray(body.allowedSessions)) patch.allowedSessionsJson = JSON.stringify(body.allowedSessions);
  if (Array.isArray(body.selectedSymbols)) patch.selectedSymbolsJson = JSON.stringify(body.selectedSymbols);
  if (Array.isArray(body.selectedMtAccountIds)) patch.selectedMtAccountIdsJson = JSON.stringify(body.selectedMtAccountIds);

  const updated = await prisma.executionAccount.update({
    where: { id: account.id },
    data: patch,
  });

  // Try to attribute the change. Fall back to anonymous if no auth header.
  const auth = req.headers.get("authorization") ?? "";
  const operatorId = auth.startsWith("Bearer ") ? `token:${auth.slice(7, 15)}…` : "anonymous";
  await prisma.operatorActionLog.create({
    data: {
      operatorId,
      actionType: "brain_execution_config_update",
      targetType: "ExecutionAccount",
      targetId: account.id,
      reason: "Brain execution config update",
      metadataJson: JSON.stringify(patch),
    },
  });

  return NextResponse.json(updated);
}
