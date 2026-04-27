"use client";

// Slide-down preferences panel inside the chat widget. Edits the chatbot
// portion of UserPreference. Requires the user to be signed in — anonymous
// users see a "sign in to personalize" hint.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ChatbotPrefs {
  defaultRiskPercent?: number;
  defaultRiskUSD?: number;
  tradingStyle?: "scalper" | "intraday" | "swing" | "position";
  preferredSessions?: ("london" | "newyork" | "asia" | "overlap")[];
  broker?: string;
  responseLength?: "concise" | "detailed";
  notes?: string;
}

const SESSIONS = ["london", "newyork", "asia", "overlap"] as const;
const STYLES = ["scalper", "intraday", "swing", "position"] as const;

export function ChatPreferencesPanel({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [prefs, setPrefs] = useState<ChatbotPrefs>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/chat/preferences", { cache: "no-store" });
        if (res.status === 401) { setAuthError(true); return; }
        const data = await res.json();
        if (data.success && data.chatbot) setPrefs(data.chatbot);
      } catch {
        // Treat fetch errors as non-fatal — user just sees empty form.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/chat/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatbot: prefs }),
      });
      if (res.ok) {
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 1500);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleSession(s: (typeof SESSIONS)[number]) {
    setPrefs((p) => {
      const cur = new Set(p.preferredSessions ?? []);
      if (cur.has(s)) cur.delete(s); else cur.add(s);
      return { ...p, preferredSessions: [...cur] as ChatbotPrefs["preferredSessions"] };
    });
  }

  if (authError) {
    return (
      <div className="px-4 py-5 border-b border-border/50 bg-surface text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-foreground">Personalize the assistant</span>
          <button onClick={onClose} className="text-muted hover:text-foreground">×</button>
        </div>
        <p className="text-muted-light">Sign in to TradeWithVic to save your trading style, default risk %, and preferred sessions. The assistant will use them to tailor every answer.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-border/50 bg-surface text-xs space-y-3 max-h-[400px] overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Personalize the assistant</span>
        <button onClick={onClose} className="text-muted hover:text-foreground text-base leading-none px-1">×</button>
      </div>

      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : (
        <>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Trading style</label>
            <div className="flex gap-1.5 flex-wrap">
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setPrefs((p) => ({ ...p, tradingStyle: p.tradingStyle === s ? undefined : s }))}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] capitalize border transition-smooth",
                    prefs.tradingStyle === s
                      ? "bg-accent text-white border-accent"
                      : "bg-surface-2 text-muted-light border-border/50 hover:border-accent/50",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Preferred sessions</label>
            <div className="flex gap-1.5 flex-wrap">
              {SESSIONS.map((s) => {
                const active = (prefs.preferredSessions ?? []).includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSession(s)}
                    className={cn(
                      "px-2.5 py-1 rounded text-[11px] capitalize border transition-smooth",
                      active
                        ? "bg-accent text-white border-accent"
                        : "bg-surface-2 text-muted-light border-border/50 hover:border-accent/50",
                    )}
                  >
                    {s === "newyork" ? "New York" : s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Default risk %</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="100"
                value={prefs.defaultRiskPercent ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setPrefs((p) => ({ ...p, defaultRiskPercent: v === "" ? undefined : parseFloat(v) }));
                }}
                placeholder="1.0"
                className="w-full px-2.5 py-1.5 rounded bg-surface-2 border border-border focus:border-accent focus:outline-none text-[11px] font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Default $ risk</label>
              <input
                type="number"
                step="50"
                min="0"
                value={prefs.defaultRiskUSD ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setPrefs((p) => ({ ...p, defaultRiskUSD: v === "" ? undefined : parseFloat(v) }));
                }}
                placeholder="100"
                className="w-full px-2.5 py-1.5 rounded bg-surface-2 border border-border focus:border-accent focus:outline-none text-[11px] font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Broker</label>
            <input
              type="text"
              value={prefs.broker ?? ""}
              onChange={(e) => setPrefs((p) => ({ ...p, broker: e.target.value || undefined }))}
              placeholder="JustMarkets, IC Markets, Pepperstone…"
              className="w-full px-2.5 py-1.5 rounded bg-surface-2 border border-border focus:border-accent focus:outline-none text-[11px]"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Response length</label>
            <div className="flex gap-1.5">
              {(["concise", "detailed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setPrefs((p) => ({ ...p, responseLength: p.responseLength === s ? undefined : s }))}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] capitalize border transition-smooth",
                    prefs.responseLength === s
                      ? "bg-accent text-white border-accent"
                      : "bg-surface-2 text-muted-light border-border/50 hover:border-accent/50",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Notes <span className="text-muted normal-case font-normal">(anything else the assistant should know — e.g. "I trade prop firm with daily loss cap of 5%")</span></label>
            <textarea
              value={prefs.notes ?? ""}
              onChange={(e) => setPrefs((p) => ({ ...p, notes: e.target.value || undefined }))}
              rows={2}
              maxLength={500}
              className="w-full px-2.5 py-1.5 rounded bg-surface-2 border border-border focus:border-accent focus:outline-none text-[11px] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {savedAt && <span className="text-[10px] text-bull-light">✓ saved</span>}
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-light disabled:opacity-40 text-white text-[11px] font-semibold transition-smooth"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
