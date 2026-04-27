// Chatbot preferences read/write. Authenticated via session cookie. The
// chatbot widget calls this to populate its settings panel and to save
// changes; conversation.ts reads the saved row server-side on every turn
// to inject personalization into the LLM context.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Allowlist of editable chatbot prefs. Anything outside this list is
// silently dropped on save — keeps a malicious client from stuffing arbitrary
// JSON into the column.
type ChatbotPrefs = {
  defaultRiskPercent?: number;
  defaultRiskUSD?: number;
  tradingStyle?: "scalper" | "intraday" | "swing" | "position";
  preferredSessions?: ("london" | "newyork" | "asia" | "overlap")[];
  broker?: string;
  responseLength?: "concise" | "detailed";
  notes?: string;
};

function sanitize(input: unknown): ChatbotPrefs {
  if (!input || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  const out: ChatbotPrefs = {};

  if (typeof o.defaultRiskPercent === "number" && o.defaultRiskPercent >= 0 && o.defaultRiskPercent <= 100) {
    out.defaultRiskPercent = o.defaultRiskPercent;
  }
  if (typeof o.defaultRiskUSD === "number" && o.defaultRiskUSD >= 0 && o.defaultRiskUSD <= 100_000) {
    out.defaultRiskUSD = o.defaultRiskUSD;
  }
  if (
    typeof o.tradingStyle === "string"
    && ["scalper", "intraday", "swing", "position"].includes(o.tradingStyle)
  ) {
    out.tradingStyle = o.tradingStyle as ChatbotPrefs["tradingStyle"];
  }
  if (Array.isArray(o.preferredSessions)) {
    const valid = ["london", "newyork", "asia", "overlap"];
    const filtered = (o.preferredSessions as unknown[]).filter(
      (s): s is "london" | "newyork" | "asia" | "overlap" =>
        typeof s === "string" && valid.includes(s),
    );
    if (filtered.length > 0) out.preferredSessions = filtered;
  }
  if (typeof o.broker === "string" && o.broker.length > 0 && o.broker.length <= 64) {
    out.broker = o.broker.trim();
  }
  if (
    typeof o.responseLength === "string"
    && ["concise", "detailed"].includes(o.responseLength)
  ) {
    out.responseLength = o.responseLength as ChatbotPrefs["responseLength"];
  }
  if (typeof o.notes === "string" && o.notes.length <= 500) {
    out.notes = o.notes.trim();
  }
  return out;
}

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const row = await prisma.userPreference.findUnique({
    where: { userId: user.id },
    select: { favoriteMarkets: true, defaultTimeframe: true, chatbotPreferences: true },
  });

  let chatbotPrefs: ChatbotPrefs = {};
  try { chatbotPrefs = JSON.parse(row?.chatbotPreferences ?? "{}") as ChatbotPrefs; } catch { /* malformed */ }
  let favoriteMarkets: string[] = [];
  try { favoriteMarkets = JSON.parse(row?.favoriteMarkets ?? "[]") as string[]; } catch { /* malformed */ }

  return NextResponse.json({
    success: true,
    favoriteMarkets,
    defaultTimeframe: row?.defaultTimeframe ?? "1h",
    chatbot: chatbotPrefs,
  });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const sanitized = sanitize((body as { chatbot?: unknown })?.chatbot);

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: { chatbotPreferences: JSON.stringify(sanitized) },
    create: {
      userId: user.id,
      chatbotPreferences: JSON.stringify(sanitized),
    },
  });

  return NextResponse.json({ success: true, chatbot: sanitized });
}
