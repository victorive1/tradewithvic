"use client";

import { useEffect } from "react";

/**
 * Syncs localStorage["user"] with the server session on every dashboard mount.
 * The session cookie is the authoritative identity; this keeps the client-side
 * userKey derivation in working order even if localStorage was cleared or the
 * user signed in on a different browser. Runs silently — no UI.
 */
export function AuthBootstrap() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store", credentials: "include" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          // Signed out (or session expired). Drop stale cached identity so
          // we don't silently issue scoped API calls with the wrong userKey.
          try { window.localStorage.removeItem("user"); } catch {}
          return;
        }
        const user = await r.json();
        if (cancelled) return;
        if (user && typeof user.email === "string") {
          try {
            window.localStorage.setItem("user", JSON.stringify(user));
          } catch {}
        }
      })
      .catch(() => {
        // Network error — leave existing localStorage alone.
      });
    return () => { cancelled = true; };
  }, []);
  return null;
}
