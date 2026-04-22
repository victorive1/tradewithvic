import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Shared auth for the EA-webhook endpoints. The EA doesn't have a session
 * cookie (it's running inside MT4/MT5, not a browser) so we authenticate
 * by a per-account shared secret. The secret is stored inside
 * LinkedTradingAccount.adapterConfigJson and sent as `x-ea-secret` on
 * every request.
 *
 * The account is identified by accountLogin passed in the URL/body so
 * we don't have to trust the client about which account they are.
 */

export interface EaAdapterConfig {
  webhookSecret?: string;
  // reserved for later: pollIntervalSec, maxSlippagePips, magicNumber, etc.
}

export function parseEaConfig(raw: string | null | undefined): EaAdapterConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export async function authenticateEa(
  req: NextRequest,
  accountLogin: string,
): Promise<
  | { ok: true; account: Awaited<ReturnType<typeof prisma.linkedTradingAccount.findFirst>> }
  | { ok: false; response: NextResponse }
> {
  const secret = req.headers.get("x-ea-secret");
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json({ error: "missing_secret" }, { status: 401 }),
    };
  }
  if (!accountLogin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "missing_account_login" }, { status: 400 }),
    };
  }

  const account = await prisma.linkedTradingAccount.findFirst({
    where: { accountLogin, isActive: true, adapterKind: "ea_webhook" },
  });
  if (!account) {
    return {
      ok: false,
      response: NextResponse.json({ error: "account_not_found_or_wrong_adapter" }, { status: 404 }),
    };
  }

  const cfg = parseEaConfig(account.adapterConfigJson);
  if (!cfg.webhookSecret || cfg.webhookSecret !== secret) {
    return {
      ok: false,
      response: NextResponse.json({ error: "bad_secret" }, { status: 403 }),
    };
  }
  return { ok: true, account };
}
