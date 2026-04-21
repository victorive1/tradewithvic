"use client";

import { useEffect, useState } from "react";
import { type AccessTag, type Role, hasAccess, normalizeRole } from "@/lib/auth/roles";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

function readCachedUser(): CurrentUser | null {
  try {
    const raw = window.localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw) as { id?: unknown; email?: unknown; name?: unknown; role?: unknown };
    if (typeof u?.id !== "string" || typeof u?.email !== "string") return null;
    return {
      id: u.id,
      email: u.email,
      name: typeof u.name === "string" ? u.name : null,
      role: normalizeRole(u.role),
    };
  } catch {
    return null;
  }
}

/**
 * Reads the cached user from localStorage (kept in sync with the session
 * cookie by AuthBootstrap). Returns { user, ready } so consumers can
 * distinguish "still loading on first render" from "signed out".
 */
export function useCurrentUser(): { user: CurrentUser | null; ready: boolean } {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readCachedUser());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "user") setUser(readCachedUser());
    };
    window.addEventListener("storage", onStorage);
    // Same-tab poll: AuthBootstrap writes in the same tab, which doesn't
    // fire storage events. Cheap poll picks up the change.
    const id = window.setInterval(() => {
      setUser((prev) => {
        const next = readCachedUser();
        if (prev?.id === next?.id && prev?.role === next?.role) return prev;
        return next;
      });
    }, 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
  }, []);

  return { user, ready };
}

export function useHasAccess(tag: AccessTag): boolean {
  const { user } = useCurrentUser();
  return hasAccess(user?.role, tag);
}
