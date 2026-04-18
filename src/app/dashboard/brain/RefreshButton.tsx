"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "tradewithvic.brain.adminToken";

export function RefreshButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const fromUrl = searchParams.get("admin");
    if (fromUrl) {
      try {
        window.localStorage.setItem(STORAGE_KEY, fromUrl);
      } catch {}
      const url = new URL(window.location.href);
      url.searchParams.delete("admin");
      window.history.replaceState({}, "", url.toString());
      setToken(fromUrl);
      return;
    }
    try {
      setToken(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      setToken(null);
    }
  }, [searchParams]);

  if (!token) return null;

  async function handleRefresh() {
    setLoading(true);
    setMessage(null);
    setIsError(false);
    try {
      const res = await fetch("/api/brain/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setIsError(true);
        setMessage(data?.error === "unauthorized" ? "Invalid admin token" : `Failed: ${data?.error ?? res.status}`);
        if (res.status === 401) {
          try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
          setToken(null);
        }
      } else {
        setMessage(`Scanned — ${data.quotesFetched}q · ${data.candlesWritten}c · ${data.indicatorsComputed}i · ${data.structureEvents}e · ${data.durationMs}ms`);
        startTransition(() => router.refresh());
      }
    } catch (err: any) {
      setIsError(true);
      setMessage(err?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
    setToken(null);
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-xs ${isError ? "text-red-500" : "text-green-500"}`}>
          {message}
        </span>
      )}
      <button
        onClick={handleLogout}
        className="text-xs text-muted hover:text-foreground transition-colors"
        title="Forget admin token in this browser"
      >
        Lock
      </button>
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" /><path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
            Scanning…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            Refresh Now
          </>
        )}
      </button>
    </div>
  );
}
