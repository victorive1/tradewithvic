"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCurrentUser } from "./useCurrentUser";
import { type AccessTag, hasAccess, ROLE_LABELS } from "@/lib/auth/roles";

interface Props {
  tag: AccessTag;
  children: ReactNode;
  /** Custom fallback node; defaults to a "no access" card. */
  fallback?: ReactNode;
}

/**
 * Client-side guard for page content. Renders `children` only when the
 * current user's role grants the given tag. While the cached user is
 * still loading on first render, shows a neutral placeholder so we
 * don't flash a "forbidden" card for signed-in admins.
 *
 * This is a UX gate, not a security boundary — enforce on the server
 * via requireRole() in every API route that returns role-restricted data.
 */
export function AccessGate({ tag, children, fallback }: Props) {
  const { user, ready } = useCurrentUser();

  if (!ready) {
    return (
      <div className="glass-card p-12 text-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="glass-card p-10 text-center space-y-4 max-w-md mx-auto">
        <div className="text-4xl">🔒</div>
        <h2 className="text-lg font-semibold">Sign in required</h2>
        <p className="text-sm text-muted">Sign in to access this page.</p>
        <Link
          href="/auth/signin"
          className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (!hasAccess(user.role, tag)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="glass-card p-10 text-center space-y-4 max-w-md mx-auto">
        <div className="text-4xl">⛔</div>
        <h2 className="text-lg font-semibold">Access restricted</h2>
        <p className="text-sm text-muted">
          This area is available to <span className="font-medium text-foreground">{ROLE_LABELS[tag]}</span> accounts.
          Your current role: <span className="font-medium text-foreground">{ROLE_LABELS[user.role]}</span>.
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-surface-2 border border-border text-sm font-semibold transition-smooth hover:border-border-light"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
