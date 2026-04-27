export const dynamic = "force-dynamic";

// Lazy getter — see lib/market-data.ts for the build-trap rationale.
function getApiKey(): string { return process.env.TWELVEDATA_API_KEY ?? ""; }
const BASE_URL = "https://api.twelvedata.com";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "EUR/USD";
  const interval = searchParams.get("interval") || "1h";
  const outputsize = searchParams.get("outputsize") || "100";

  const apiKey = getApiKey();
  if (!apiKey) {
    return Response.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const url = `${BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!res.ok) {
      return Response.json({ error: "Failed to fetch candle data" }, { status: 502 });
    }

    const data = await res.json();

    if (data.code) {
      return Response.json({ error: data.message || "API error" }, { status: 400 });
    }

    return Response.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "request_failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
