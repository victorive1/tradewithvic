"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Tab bar shared by the Brain overview and Trade Setups sub-routes.
 * Renders at the top of both pages so the user can flip between them
 * without losing context.
 */
export function BrainTabs({ setupsCount }: { setupsCount?: number }) {
  const pathname = usePathname();
  const tabs: Array<{ href: string; label: string; count?: number }> = [
    { href: "/dashboard/brain", label: "Overview" },
    { href: "/dashboard/brain/setups", label: "Trade Setups", count: setupsCount },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-border/40">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative px-4 py-2 text-sm font-medium transition-smooth",
              active ? "text-foreground" : "text-muted hover:text-muted-light",
            )}
          >
            <span>{t.label}</span>
            {t.count != null && (
              <span className={cn(
                "ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded",
                active ? "bg-accent/20 text-accent-light" : "bg-surface-2 text-muted",
              )}>
                {t.count}
              </span>
            )}
            {active && (
              <span
                aria-hidden
                className="absolute left-0 right-0 -bottom-px h-0.5 bg-accent"
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
