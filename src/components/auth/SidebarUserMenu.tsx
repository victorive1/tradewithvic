"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface CachedUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
}

/**
 * Profile footer for the dashboard sidebar. Reads localStorage["user"]
 * (kept in sync with the session cookie by AuthBootstrap) to choose
 * between a signed-in "name + sign out" layout and a signed-out
 * "Sign In" link.
 */
export function SidebarUserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const [user, setUser] = useState<CachedUser | null>(null);
  const [ready, setReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    function read() {
      try {
        const raw = window.localStorage.getItem("user");
        if (!raw) { setUser(null); return; }
        const u = JSON.parse(raw) as CachedUser;
        if (u && typeof u.email === "string") setUser(u);
        else setUser(null);
      } catch {
        setUser(null);
      }
    }
    read();
    setReady(true);
    // AuthBootstrap updates localStorage after /api/auth/me; pick that up.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "user") read();
    };
    window.addEventListener("storage", onStorage);
    const id = window.setInterval(read, 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    } catch {
      // Network error — still clear local state so the UI doesn't lie.
    }
    try { window.localStorage.removeItem("user"); } catch {}
    window.location.href = "/auth/signin";
  }

  if (!ready) {
    return (
      <div className="p-3 border-t border-border/40 relative shrink-0">
        <div className="h-12" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-3 border-t border-border/40 relative shrink-0">
        <Link
          href="/auth/signin"
          onClick={onNavigate}
          className="flex items-center gap-3 p-2 rounded-xl transition-smooth hover:bg-surface-2/70 border border-accent/30 bg-accent/5"
        >
          <div className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-muted">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Sign In</p>
            <p className="text-[10px] text-muted truncate tracking-wider uppercase">Access your dashboard</p>
          </div>
        </Link>
      </div>
    );
  }

  const displayName = user.name?.trim() || user.email;
  const initial = (displayName[0] ?? "?").toUpperCase();
  const roleLabel = user.role === "admin" ? "Admin · Profile" : "Profile";

  return (
    <div className="p-3 border-t border-border/40 relative shrink-0">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/profile"
          onClick={onNavigate}
          className="flex-1 flex items-center gap-3 p-2 rounded-xl transition-smooth hover:bg-surface-2/70 border border-transparent hover:border-border/50 min-w-0"
        >
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent via-accent-light to-accent flex items-center justify-center text-white text-xs font-bold shadow-[0_4px_16px_var(--color-accent-glow)]">
              {initial}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-bull border-2 border-surface" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{displayName}</p>
            <p className="text-[10px] text-muted truncate tracking-wider uppercase">{roleLabel}</p>
          </div>
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          title="Sign out"
          aria-label="Sign out"
          className="shrink-0 w-9 h-9 rounded-xl bg-surface-2/60 border border-border hover:border-bear/50 hover:text-bear-light flex items-center justify-center transition-smooth text-muted disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H2.25" />
          </svg>
        </button>
      </div>
    </div>
  );
}
