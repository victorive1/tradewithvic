import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { readUserKey } from "@/lib/trading/user-key";
import { parseEaConfig, type EaAdapterConfig } from "@/lib/trading/ea-auth";
import { findBrokerTemplate } from "@/lib/trading/broker-templates";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Provision (or re-provision) an account for the EA-webhook adapter.
 * Flips adapterKind to "ea_webhook", generates a fresh webhook secret,
 * and returns the secret + pull/ack/ping URLs once so the user can paste
 * them into the EA.
 *
 * The secret is hashed? No — it has to live in plaintext because the EA
 * sends it back in a header. Treat it like an API key: rotate on
 * compromise, never log it. This is why the secret is only returned on
 * create, not via GET.
 */

interface PutBody {
  rotate?: boolean; // regenerate the secret even if one already exists
}

function baseUrl(req: NextRequest): string {
  // Prefer the Host header so the URL matches however the user hit us.
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userKey = readUserKey(req);
  if (!userKey) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body: PutBody = await req.json().catch(() => ({}));

  const account = await prisma.linkedTradingAccount.findFirst({
    where: { id, userKey, isActive: true },
  });
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const existing: EaAdapterConfig = parseEaConfig(account.adapterConfigJson);
  const webhookSecret =
    existing.webhookSecret && !body.rotate
      ? existing.webhookSecret
      : randomBytes(24).toString("base64url");

  const nextConfig: EaAdapterConfig = { ...existing, webhookSecret };

  // Also apply the broker's symbol-mapping template if this account hasn't
  // been customized yet. Lets a legacy "mock" account upgraded via the
  // Enable EA Bridge button get the .ecn suffix + renames in the same step
  // instead of needing a separate manual update.
  const template = findBrokerTemplate(account.brokerName);
  const shouldApplyTemplate = !!template
    && account.brokerSymbolSuffix === ""
    && account.brokerSymbolRenames === "{}";

  const updated = await prisma.linkedTradingAccount.update({
    where: { id: account.id },
    data: {
      adapterKind: "ea_webhook",
      adapterConfigJson: JSON.stringify(nextConfig),
      ...(shouldApplyTemplate && template
        ? {
            brokerSymbolSuffix: template.brokerSymbolSuffix,
            brokerSymbolRenames: JSON.stringify(template.brokerSymbolRenames),
          }
        : {}),
    },
  });

  const origin = baseUrl(req);
  return NextResponse.json({
    account: {
      id: updated.id,
      accountLogin: updated.accountLogin,
      brokerName: updated.brokerName,
      adapterKind: updated.adapterKind,
      connectionStatus: updated.connectionStatus,
      lastConnectedAt: updated.lastConnectedAt,
    },
    // Only the plaintext secret you'll paste into the EA. Won't be
    // shown again; re-PUT with rotate:true to generate a new one.
    webhookSecret,
    endpoints: {
      pull: `${origin}/api/mt5/ea/pull?accountLogin=${encodeURIComponent(updated.accountLogin)}`,
      ack: `${origin}/api/mt5/ea/ack`,
      ping: `${origin}/api/mt5/ea/ping`,
    },
  });
}

/**
 * GET — return the account's current EA connection state (no secret).
 * Useful for the UI to show "last heartbeat 12s ago" etc.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userKey = readUserKey(req);
  if (!userKey) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const account = await prisma.linkedTradingAccount.findFirst({
    where: { id, userKey, isActive: true },
    select: {
      id: true,
      accountLogin: true,
      brokerName: true,
      adapterKind: true,
      connectionStatus: true,
      lastConnectedAt: true,
      adapterConfigJson: true,
    },
  });
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const cfg = parseEaConfig(account.adapterConfigJson);
  const origin = baseUrl(req);
  return NextResponse.json({
    account: {
      id: account.id,
      accountLogin: account.accountLogin,
      brokerName: account.brokerName,
      adapterKind: account.adapterKind,
      connectionStatus: account.connectionStatus,
      lastConnectedAt: account.lastConnectedAt,
    },
    hasSecret: !!cfg.webhookSecret,
    endpoints: {
      pull: `${origin}/api/mt5/ea/pull?accountLogin=${encodeURIComponent(account.accountLogin)}`,
      ack: `${origin}/api/mt5/ea/ack`,
      ping: `${origin}/api/mt5/ea/ping`,
    },
  });
}
