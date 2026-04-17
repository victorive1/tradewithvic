"use client";

import { useState, useEffect } from "react";

export function LastUpdated({ timestamp }: { timestamp?: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const ts = timestamp || now;
  const ago = Math.floor((now - ts) / 1000);

  let label = "Just now";
  if (ago > 300) label = `${Math.floor(ago / 60)}m ago (stale)`;
  else if (ago > 60) label = `${Math.floor(ago / 60)}m ago`;
  else if (ago > 10) label = `${ago}s ago`;

  const isStale = ago > 300;

  return (
    <span className={`text-xs ${isStale ? "text-bear-light" : "text-muted"}`}>
      Last updated: {label}
    </span>
  );
}

export function LiveIndicator() {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span className="w-2 h-2 rounded-full bg-bull pulse-live" />
      Live
    </span>
  );
}

export function DataUnavailable({ message }: { message?: string }) {
  return (
    <div className="glass-card p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-warn/10 border border-warn/20 flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-warn" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p className="text-sm text-muted">{message || "Market data temporarily unavailable. Data will refresh automatically."}</p>
    </div>
  );
}
