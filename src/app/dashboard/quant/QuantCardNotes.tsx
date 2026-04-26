"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  explanation: string | null;
  invalidation: string | null;
}

/**
 * Collapsible notes block for a Quant setup card. Hidden by default so the
 * grid stays scannable; click the toggle to reveal explanation + invalidation.
 *
 * The parent card is a <Link> to the decision page, so the toggle button
 * has to stop propagation/preventDefault — otherwise clicking "show notes"
 * would also navigate.
 */
export function QuantCardNotes({ explanation, invalidation }: Props) {
  const [open, setOpen] = useState(false);
  if (!explanation && !invalidation) return null;

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  }

  return (
    <div className="pt-2 border-t border-border/30 space-y-2">
      <button
        onClick={toggle}
        className={cn(
          "text-[10px] uppercase tracking-wider font-semibold transition-smooth",
          open ? "text-accent" : "text-accent-light hover:text-accent",
        )}
      >
        {open ? "▾ hide notes" : "▸ show notes"}
      </button>
      {open && (
        <div className="space-y-2">
          {explanation && (
            <p className="text-[11px] text-muted-light leading-relaxed whitespace-pre-line">
              {explanation}
            </p>
          )}
          {invalidation && (
            <p className="text-[10px] text-muted">
              <span className="uppercase tracking-wider text-[9px]">Invalidated if:</span>{" "}
              {invalidation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
