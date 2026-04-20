"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Client-side guard that wraps admin-only dashboard routes. Reads the
 * role from the `user` entry in localStorage written at signin. If the
 * user isn't admin, we show a minimal "access denied" screen instead of
 * bouncing silently — makes it obvious that the URL is restricted.
 *
 * This is defence-in-depth only. API routes invoked from these pages
 * must still authenticate themselves (CRON_SECRET for jobs,
 * ADMIN_REFRESH_SECRET for config mutations).
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "admin" | "denied">("checking");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("user");
      if (!raw) { setState("denied"); return; }
      const u = JSON.parse(raw) as { role?: unknown };
      if (typeof u?.role === "string" && u.role === "admin") {
        setState("admin");
      } else {
        setState("denied");
      }
    } catch {
      setState("denied");
    }
  }, [router]);

  if (state === "checking") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-muted animate-pulse">Verifying access…</div>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass-card p-8 max-w-md text-center space-y-3">
          <div className="text-3xl">🔒</div>
          <h2 className="text-lg font-semibold text-foreground">Admin access required</h2>
          <p className="text-sm text-muted">
            This section is restricted to platform administrators. If you believe you should have access,
            sign in with your admin account.
          </p>
          <Link
            href="/dashboard"
            className="inline-block mt-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-smooth"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
