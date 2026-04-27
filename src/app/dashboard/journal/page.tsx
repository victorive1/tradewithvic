"use client";

// Trading Journal — main entry point. Tabs: Today / Calendar / Strategy
// Performance / Mistakes. Each tab is its own client component below for
// readability.

import { useState } from "react";
import { cn } from "@/lib/utils";
import { JournalToday } from "./JournalToday";
import { JournalCalendar } from "./JournalCalendar";
import { JournalStrategy } from "./JournalStrategy";
import { JournalMistakes } from "./JournalMistakes";

type Tab = "today" | "calendar" | "strategy" | "mistakes";

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: "today", label: "Today", description: "Quick log + today's trades + daily review" },
  { id: "calendar", label: "Calendar", description: "Heatmap of P&L per day" },
  { id: "strategy", label: "Strategy Performance", description: "Where the edge is + where it's leaking" },
  { id: "mistakes", label: "Mistakes & Discipline", description: "What's costing the most" },
];

export default function JournalPage() {
  const [tab, setTab] = useState<Tab>("today");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Trading Journal</h1>
          <span className="text-xs bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">
            studies the trader, not just the trade
          </span>
        </div>
        <p className="text-sm text-muted mt-1 max-w-3xl">
          {active.description}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border/50 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-1.5 rounded-t-lg text-xs font-medium transition-smooth",
              tab === t.id
                ? "bg-accent text-white"
                : "text-muted-light hover:text-foreground hover:bg-surface-2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "today" && <JournalToday />}
      {tab === "calendar" && <JournalCalendar />}
      {tab === "strategy" && <JournalStrategy />}
      {tab === "mistakes" && <JournalMistakes />}
    </div>
  );
}
