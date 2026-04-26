"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/auth/useCurrentUser";
import { computeLotSize } from "@/lib/trading/lot-sizing";

/**
 * Admin-only "what lot size do I need to make $X at 1R?" planning tool.
 *
 * Two pieces:
 *   - <AdminRiskTargetBar /> — top-of-page input with a Save button.
 *     Persists to localStorage (per browser, not per account); mounting
 *     cards listen for changes and recompute live.
 *   - <AdminLotSizeForCard symbol entry stopLoss /> — drop into any
 *     setup card. Renders a single line with the lot size required so
 *     that hitting 1R = the saved $ target. Hidden for non-admins and
 *     when no target is saved.
 *
 * Both components no-op for non-admin users — safe to drop into shared
 * pages without leaking the feature.
 */

const STORAGE_KEY = "twv:admin:risk-target-usd";
const CHANGED_EVENT = "twv:risk-target-usd-changed";

function readSaved(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function useSavedRiskUSD(): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(readSaved());
    const refresh = () => setValue(readSaved());
    window.addEventListener(CHANGED_EVENT, refresh);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) refresh();
    });
    return () => {
      window.removeEventListener(CHANGED_EVENT, refresh);
    };
  }, []);
  return value;
}

export function AdminRiskTargetBar() {
  const { user, ready } = useCurrentUser();
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(0);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const v = readSaved();
    setSaved(v);
    setDraft(v > 0 ? String(v) : "");
  }, []);

  if (!ready || user?.role !== "admin") return null;

  function save() {
    const n = parseFloat(draft);
    if (!Number.isFinite(n) || n <= 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      setSaved(0);
    } else {
      window.localStorage.setItem(STORAGE_KEY, String(n));
      setSaved(n);
    }
    window.dispatchEvent(new Event(CHANGED_EVENT));
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  }

  const dirty = draft !== (saved > 0 ? String(saved) : "");

  return (
    <div className="glass-card p-3 flex items-center gap-3 flex-wrap border border-warn/30 bg-warn/5">
      <span className="text-[10px] uppercase tracking-wider text-warn font-semibold">
        Admin · Lot size for $ target
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <span className="text-xs text-muted">$</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="50"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder="1000"
          className="flex-1 max-w-[160px] px-3 py-1.5 rounded-lg bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm font-mono"
        />
        <button
          onClick={save}
          disabled={!dirty && saved > 0}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold transition-smooth disabled:opacity-40"
        >
          Save
        </button>
        {justSaved && <span className="text-[10px] text-bull-light">✓ saved</span>}
        {!dirty && saved > 0 && !justSaved && (
          <span className="text-[10px] text-muted">target ${saved.toLocaleString()}</span>
        )}
      </div>
      <span className="text-[10px] text-muted hidden sm:block">
        Per-browser. Each card shows the lot size needed so 1R = +${saved > 0 ? saved.toLocaleString() : "—"}.
      </span>
    </div>
  );
}

interface CardProps {
  symbol: string;
  entry: number | null | undefined;
  stopLoss: number | null | undefined;
  /** Optional override for layout — defaults to "row" inline with stat grid */
  variant?: "row" | "block";
}

export function AdminLotSizeForCard({ symbol, entry, stopLoss, variant = "row" }: CardProps) {
  const { user, ready } = useCurrentUser();
  const riskUSD = useSavedRiskUSD();

  if (!ready || user?.role !== "admin") return null;
  if (!riskUSD || riskUSD <= 0) return null;
  if (entry == null || stopLoss == null) return null;
  if (!Number.isFinite(entry) || !Number.isFinite(stopLoss) || entry === stopLoss) return null;

  const result = computeLotSize({ symbol, entry, stopLoss, riskUSD });
  if (!Number.isFinite(result.lotSize) || result.lotSize <= 0) return null;

  const isApprox = result.notes.length > 0 || result.warnings.length > 0;
  const lotDisplay =
    result.lotSize >= 0.01 ? result.lotSize.toFixed(2) : result.lotSize.toExponential(2);

  if (variant === "block") {
    return (
      <div className="bg-warn/5 border border-warn/30 rounded-lg p-2 text-center">
        <div className="text-[9px] uppercase tracking-wider text-warn mb-0.5">
          Lot · ${riskUSD.toLocaleString()}
        </div>
        <div className="text-sm font-bold font-mono text-warn">
          {lotDisplay}
          {isApprox && <span className="text-muted ml-0.5 text-[10px]">≈</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between text-[11px] font-mono">
      <span className="text-warn/80">Lot · ${riskUSD.toLocaleString()}</span>
      <span className="text-warn font-semibold">
        {lotDisplay}
        {isApprox && <span className="text-muted ml-0.5">≈</span>}
      </span>
    </div>
  );
}
