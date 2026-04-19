"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  engineId: string;
  recipeId: string;
  label: string;
}

interface RunResult {
  ok: boolean;
  summary: string;
  details?: string[];
  error?: string;
  durationMs?: number;
}

export function FixButton({ engineId, recipeId, label }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function handleClick() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, engineId }),
      });
      const data = (await res.json()) as RunResult;
      setResult(data);
      if (data.ok) {
        // Refresh the server component so the probes re-run.
        router.refresh();
      }
    } catch (e: unknown) {
      setResult({ ok: false, summary: "Request failed", error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={busy}
        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-accent/20 text-accent-light border border-accent/40 hover:bg-accent/30 transition-smooth disabled:opacity-50 whitespace-nowrap"
      >
        {busy ? "Running…" : `⚡ ${label}`}
      </button>
      {result && (
        <div
          className={`text-[11px] rounded-md px-2 py-1.5 border ${
            result.ok
              ? "bg-bull/10 text-bull-light border-bull/30"
              : "bg-bear/10 text-bear-light border-bear/30"
          }`}
        >
          <div className="font-semibold">{result.ok ? "✓ Done" : "✗ Failed"}</div>
          <div className="opacity-90">{result.summary}</div>
          {result.error && <div className="opacity-80 mt-0.5 font-mono">{result.error}</div>}
        </div>
      )}
    </div>
  );
}
