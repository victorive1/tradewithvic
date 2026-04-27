"use client";

// Chat history list — shows the signed-in user's last 25 conversations,
// most recent first. Click to load that session into the widget.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface SessionListItem {
  id: string;
  title: string | null;
  currentAgent: string;
  escalated: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface Props {
  activeSessionId: string | null;
  onLoad: (sessionId: string) => void;
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function ChatHistoryPanel({ activeSessionId, onLoad, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/chat/sessions", { cache: "no-store" });
        if (res.status === 401) { setAuthError(true); return; }
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) setSessions(data.sessions);
      } catch {
        // No sessions to show; user gets the empty state.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this conversation? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      if (res.ok) setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // No-op; the delete button just doesn't visibly succeed.
    }
  }

  if (authError) {
    return (
      <div className="px-4 py-5 border-b border-border/50 bg-surface text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-foreground">Past conversations</span>
          <button onClick={onClose} className="text-muted hover:text-foreground">×</button>
        </div>
        <p className="text-muted-light">Sign in to TradeWithVic to keep your chat history across devices.</p>
      </div>
    );
  }

  return (
    <div className="border-b border-border/50 bg-surface text-xs max-h-[300px] overflow-y-auto">
      <div className="sticky top-0 px-4 py-2 bg-surface border-b border-border/50 flex items-center justify-between">
        <span className="font-semibold text-foreground">Past conversations</span>
        <button onClick={onClose} className="text-muted hover:text-foreground text-base leading-none px-1">×</button>
      </div>
      {loading ? (
        <div className="px-4 py-3 text-muted">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="px-4 py-3 text-muted-light">No saved conversations yet. Anything you say here is automatically saved while you're signed in.</div>
      ) : (
        <div className="divide-y divide-border/30">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onLoad(s.id)}
              className={cn(
                "w-full text-left px-4 py-2.5 hover:bg-surface-2 transition-smooth flex items-start gap-2 group",
                s.id === activeSessionId ? "bg-accent/5" : "",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-foreground truncate">{s.title ?? "(no title)"}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted">
                  <span>{relativeTime(s.updatedAt)}</span>
                  <span>·</span>
                  <span>{s.messageCount} message{s.messageCount === 1 ? "" : "s"}</span>
                  {s.escalated && <><span>·</span><span className="text-warn">flagged</span></>}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(s.id, e)}
                className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded text-muted-light hover:text-bear-light hover:bg-bear/10 transition-smooth"
                title="Delete"
              >
                Delete
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
