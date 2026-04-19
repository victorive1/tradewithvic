import { NextRequest, NextResponse } from "next/server";
import { runRemediation, listRecipes } from "@/lib/agent/remediation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// A full scan cycle can take ~40s; give ourselves headroom.
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({
    recipes: listRecipes().map((r) => ({ id: r.id, label: r.label, description: r.description })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const recipeId = String(body.recipeId ?? "");
  const engineId = body.engineId ? String(body.engineId) : undefined;
  if (!recipeId) {
    return NextResponse.json({ ok: false, error: "missing_recipe_id" }, { status: 400 });
  }
  const result = await runRemediation(recipeId, engineId);
  return NextResponse.json(result);
}
