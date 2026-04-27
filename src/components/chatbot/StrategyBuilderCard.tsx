"use client";

// Renders a structured StrategyBlueprint inside the chat. Each section is
// collapsible — entry rules and pseudocode are open by default since those
// are the highest-value parts; everything else is collapsed to keep the
// chat scrollable.
//
// Includes a "Copy as text" button that flattens the whole blueprint into
// a plain-text rulebook the user can paste into their journal, a Discord
// channel, or hand to a developer for codification.

import { useState } from "react";
import { cn } from "@/lib/utils";

interface StrategyBlueprint {
  name: string;
  symbols: string[];
  marketConditions: string;
  timeframes: { bias: string; entry: string };
  entryRules: string[];
  stopLossRules: string;
  takeProfitRules: string;
  riskRules: string;
  invalidationRules: string;
  newsFilter: string;
  sessionFilter: string;
  backtestingPlan: string;
  pseudocode: string;
  alertLogic: string;
}

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/30 first:border-t-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-light hover:text-foreground py-2 px-2 transition-smooth"
      >
        <span className="font-semibold">{title}</span>
        <span className={cn("transition-transform text-muted", open ? "rotate-180" : "")}>▾</span>
      </button>
      {open && <div className="px-2 pb-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap">{children}</div>}
    </div>
  );
}

function flattenForCopy(b: StrategyBlueprint): string {
  return [
    `STRATEGY: ${b.name}`,
    `Symbols: ${b.symbols.join(", ") || "—"}`,
    `Bias TF: ${b.timeframes.bias}  ·  Entry TF: ${b.timeframes.entry}`,
    ``,
    `MARKET CONDITIONS`,
    b.marketConditions,
    ``,
    `ENTRY RULES`,
    ...b.entryRules.map((r, i) => `${i + 1}. ${r}`),
    ``,
    `STOP LOSS`,
    b.stopLossRules,
    ``,
    `TAKE PROFIT`,
    b.takeProfitRules,
    ``,
    `RISK RULES`,
    b.riskRules,
    ``,
    `INVALIDATION (early bail-out)`,
    b.invalidationRules,
    ``,
    `NEWS FILTER`,
    b.newsFilter,
    ``,
    `SESSION FILTER`,
    b.sessionFilter,
    ``,
    `BACKTESTING PLAN`,
    b.backtestingPlan,
    ``,
    `PSEUDOCODE`,
    b.pseudocode,
    ``,
    `ALERT LOGIC`,
    b.alertLogic,
  ].join("\n");
}

export function StrategyBuilderCard({ blueprint }: { blueprint: StrategyBlueprint }) {
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(flattenForCopy(blueprint));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available — silently no-op. Could fall back to
      // selecting the textarea trick but not worth the code for an edge case.
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-accent/40 bg-accent/5 overflow-hidden">
      <div className="px-3 py-2.5 bg-accent/10 border-b border-accent/30 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-accent-light font-semibold">Strategy Blueprint</div>
          <div className="text-sm font-bold text-foreground truncate">{blueprint.name}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {blueprint.symbols.map((s) => (
              <span key={s} className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-surface-2 text-muted-light border border-border/50">{s}</span>
            ))}
            <span className="text-[9px] text-muted">
              Bias <span className="font-mono text-foreground">{blueprint.timeframes.bias}</span> · Entry <span className="font-mono text-foreground">{blueprint.timeframes.entry}</span>
            </span>
          </div>
        </div>
        <button
          onClick={copyAll}
          className="text-[10px] px-2 py-1 rounded bg-surface-2 hover:bg-surface-3 border border-border/50 text-muted-light hover:text-foreground transition-smooth flex-shrink-0"
        >
          {copied ? "✓ copied" : "Copy"}
        </button>
      </div>

      <div className="p-1">
        <Section title="Market conditions" defaultOpen>
          {blueprint.marketConditions}
        </Section>
        <Section title="Entry rules" defaultOpen>
          <ol className="list-decimal pl-4 space-y-1">
            {blueprint.entryRules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </Section>
        <Section title="Stop loss">{blueprint.stopLossRules}</Section>
        <Section title="Take profit">{blueprint.takeProfitRules}</Section>
        <Section title="Risk rules">{blueprint.riskRules}</Section>
        <Section title="Invalidation">{blueprint.invalidationRules}</Section>
        <Section title="News filter">{blueprint.newsFilter}</Section>
        <Section title="Session filter">{blueprint.sessionFilter}</Section>
        <Section title="Backtesting plan">{blueprint.backtestingPlan}</Section>
        <Section title="Pseudocode" defaultOpen>
          <pre className="bg-surface-2 border border-border/30 rounded-lg p-2.5 overflow-x-auto text-[11px] font-mono leading-relaxed whitespace-pre">{blueprint.pseudocode}</pre>
        </Section>
        <Section title="Alert logic">{blueprint.alertLogic}</Section>
      </div>
    </div>
  );
}
