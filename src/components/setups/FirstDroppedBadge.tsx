import { cn } from "@/lib/utils";
import { formatFirstDropped } from "@/lib/setups/first-dropped";

// Per-session accent so the origin time is scannable at a glance in the
// backlog. Subtle — these are informational, not status colors.
const SESSION_CLASS: Record<string, string> = {
  sydney: "text-sky-300/90",
  tokyo: "text-rose-300/90",
  london: "text-amber-300/90",
  new_york: "text-emerald-300/90",
};

/**
 * Renders the immutable "first dropped" origin time of a trade setup as
 * UTC clock + dominant trading session, e.g.:
 *
 *   🕓 First dropped at 12:45 UTC · London session
 *
 * This is deliberately separate from any relative "posted 2m ago" label —
 * it never changes once the setup is created. Server-safe (no hooks), so
 * it can render in both server and client components.
 *
 * `at` is the setup's createdAt (Date, ISO string, or epoch ms).
 * `compact` drops the leading "First dropped at " for tight card headers.
 */
export function FirstDroppedBadge({
  at,
  compact = false,
  withDate = false,
  className,
}: {
  at: Date | string | number;
  compact?: boolean;
  // Include the UTC calendar date (e.g. "5 Jun 2026") in the line. Off by
  // default so live cards stay terse; the Backlog turns it on.
  withDate?: boolean;
  className?: string;
}) {
  const fd = formatFirstDropped(at);
  const sessionClass = SESSION_CLASS[fd.session.key] ?? "text-accent-light";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] text-muted",
        className,
      )}
      title={`First dropped at ${fd.hhmm} UTC (${fd.session.label} session) — ${fd.iso}`}
    >
      <svg
        className="w-3 h-3 shrink-0 opacity-70"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.6}
          d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
        />
      </svg>
      {compact ? (
        <span className="font-mono tabular-nums">
          {fd.hhmm} UTC
          {withDate && <span className="ml-1 font-sans text-foreground/80">· {fd.date}</span>}
          <span className={cn("ml-1 font-sans", sessionClass)}>· {fd.session.label}</span>
        </span>
      ) : (
        <span>
          First dropped at{" "}
          <span className="font-mono tabular-nums text-foreground/90">{fd.hhmm} UTC</span>
          {withDate && <span className="text-foreground/80"> · {fd.date}</span>}
          <span className={cn("font-medium", sessionClass)}> · {fd.session.label} session</span>
        </span>
      )}
    </span>
  );
}
