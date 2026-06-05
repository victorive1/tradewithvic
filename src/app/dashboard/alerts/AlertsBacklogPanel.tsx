"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BacklogClient, type BacklogItem } from "../backlog/BacklogClient";

interface BacklogResponse {
  items: BacklogItem[];
  capped: boolean;
  retentionDays: number;
  perSourceCap: number;
}

/**
 * Backlog tab body for the Smart Alerts page. Lazy-loads the gated
 * /api/backlog (agent/admin only) the first time the tab is opened and
 * renders the full backlog experience inline, so admins can review the
 * 30-day history right where the live setups live.
 */
export function AlertsBacklogPanel() {
  const [data, setData] = useState<BacklogResponse | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/backlog", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setState("forbidden");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const json = (await res.json()) as BacklogResponse;
        if (cancelled) return;
        setData(json);
        setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <div className="glass-card p-12 text-center text-sm text-muted">Loading backlog…</div>;
  }
  if (state === "forbidden") {
    return (
      <div className="glass-card p-10 text-center text-sm text-muted">
        The Backlog is available to agent and admin accounts.
      </div>
    );
  }
  if (state === "error" || !data) {
    return (
      <div className="glass-card p-10 text-center text-sm text-muted">
        Couldn’t load the backlog. Try again shortly.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/dashboard/backlog"
          className="text-xs text-accent-light hover:text-accent underline"
        >
          Open full Backlog page →
        </Link>
      </div>
      <BacklogClient
        items={data.items}
        retentionDays={data.retentionDays}
        capped={data.capped}
        perSourceCap={data.perSourceCap}
      />
    </div>
  );
}
