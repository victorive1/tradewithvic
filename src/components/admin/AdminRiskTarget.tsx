"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/auth/useCurrentUser";
import { computeLotSize } from "@/lib/trading/lot-sizing";

/**
 * Per-card lot-size hint shown on every trade-setup card across the
 * platform. The question we're answering: "what lot size do I need to
 * make $X if this setup hits 1R?"
 *
 *   - <RiskTargetBar />        — admin-only configuration UI. Lets the
 *                                operator change the $ target. Persists
 *                                to localStorage (per-browser).
 *   - <LotSizeForCard />       — visible to everyone. Defaults to $1,000
 *                                if no target is saved. Always renders
 *                                something visible (no silent null
 *                                returns) so we never have a "feature is
 *                                wired but you can't see it" failure mode.
 *
 * Both names are also exported under their old `Admin*` names so existing
 * call sites keep working without churn.
 */

const STORAGE_KEY = "twv:admin:risk-target-usd";
const CHANGED_EVENT = "twv:risk-target-usd-changed";
const DEFAULT_RISK_USD = 1000;

function readSaved(): number {
  if (typeof window === "undefined") return DEFAULT_RISK_USD;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_RISK_USD;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RISK_USD;
}

function useSavedRiskUSD(): number {
  // Pre-hydration we can't read localStorage; return the default so the
  // per-card display shows a useful number on the very first render
  // instead of nothing.
  const [value, setValue] = useState<number>(DEFAULT_RISK_USD);
  useEffect(() => {
    setValue(readSaved());
    const refresh = () => setValue(readSaved());
    window.addEventListener(CHANGED_EVENT, refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return value;
}

export function RiskTargetBar() {
  const { user, ready } = useCurrentUser();
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(DEFAULT_RISK_USD);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const v = readSaved();
    setSaved(v);
    setDraft(String(v));
  }, []);

  // Bar is configuration UI — admin-only. The per-card display below
  // is visible to everyone with the default target.
  if (!ready || user?.role !== "admin") return null;

  function save() {
    const n = parseFloat(draft);
    if (!Number.isFinite(n) || n <= 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      setSaved(DEFAULT_RISK_USD);
      setDraft(String(DEFAULT_RISK_USD));
    } else {
      window.localStorage.setItem(STORAGE_KEY, String(n));
      setSaved(n);
    }
    window.dispatchEvent(new Event(CHANGED_EVENT));
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  }

  const dirty = draft !== String(saved);

  return (
    <div className="glass-card p-3 flex items-center gap-3 flex-wrap border border-warn/30 bg-warn/5">
      <span className="text-[10px] uppercase tracking-wider text-warn font-semibold">
        Lot size for $ target
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
          placeholder={String(DEFAULT_RISK_USD)}
          className="flex-1 max-w-[160px] px-3 py-1.5 rounded-lg bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm font-mono"
        />
        <button
          onClick={save}
          disabled={!dirty}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold transition-smooth disabled:opacity-40"
        >
          Save
        </button>
        {justSaved && <span className="text-[10px] text-bull-light">✓ saved</span>}
        {!dirty && !justSaved && (
          <span className="text-[10px] text-muted">target ${saved.toLocaleString()}</span>
        )}
      </div>
      <span className="text-[10px] text-muted hidden sm:block">
        Per-browser. Each card shows the lot size needed so 1R = +${saved.toLocaleString()}.
      </span>
    </div>
  );
}

interface CardProps {
  symbol: string;
  entry: number | null | undefined;
  stopLoss: number | null | undefined;
  /** Layout — "row" inline (default), "block" for grid cells */
  variant?: "row" | "block";
}

export function LotSizeForCard({ symbol, entry, stopLoss, variant = "row" }: CardProps) {
  const riskUSD = useSavedRiskUSD();

  // Decide what to render. We deliberately *never* return null — silent
  // disappearance was the main failure mode that made admins doubt the
  // feature was even shipped. Show the calculation when we have prices,
  // a clear placeholder otherwise.
  let lotDisplay: string;
  let isApprox = false;
  let unavailable = false;

  if (entry == null || stopLoss == null
      || !Number.isFinite(entry) || !Number.isFinite(stopLoss)
      || entry === stopLoss) {
    lotDisplay = "—";
    unavailable = true;
  } else {
    const result = computeLotSize({ symbol, entry, stopLoss, riskUSD });
    if (!Number.isFinite(result.lotSize) || result.lotSize <= 0) {
      lotDisplay = "—";
      unavailable = true;
    } else {
      lotDisplay = result.lotSize >= 0.01
        ? result.lotSize.toFixed(2)
        : result.lotSize.toExponential(2);
      isApprox = result.notes.length > 0 || result.warnings.length > 0;
    }
  }

  if (variant === "block") {
    return (
      <div
        data-testid="lot-size-card"
        className="bg-warn/5 border border-warn/30 rounded-lg p-2 text-center"
      >
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
    <div
      data-testid="lot-size-card"
      className="flex justify-between items-center text-[11px] font-mono px-2 py-1.5 rounded-md bg-warn/5 border border-warn/20"
    >
      <span className="text-warn/90">
        Lot for ${riskUSD.toLocaleString()} at 1R
      </span>
      <span className="text-warn font-semibold">
        {unavailable ? "—" : lotDisplay}
        {isApprox && <span className="text-muted ml-0.5">≈</span>}
      </span>
    </div>
  );
}

// Backwards-compatible aliases — many pages still import the original names.
export const AdminRiskTargetBar = RiskTargetBar;
export const AdminLotSizeForCard = LotSizeForCard;
