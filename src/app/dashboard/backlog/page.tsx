import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { hasAccess, normalizeRole, ROLE_LABELS } from "@/lib/auth/roles";
import { loadBacklog } from "@/lib/setups/backlog-query";
import { BacklogClient } from "./BacklogClient";

// The backlog is historical and gated — never cache it across requests,
// and always reflect the live DB on each visit.
export const dynamic = "force-dynamic";

export default async function BacklogPage() {
  const me = await getSession();

  if (!me) {
    return <DenyCard reason="signin" />;
  }
  if (!hasAccess(normalizeRole(me.role), "agent")) {
    return <DenyCard reason="forbidden" role={me.role} />;
  }

  const { items, capped, retentionDays, perSourceCap } = await loadBacklog();

  return (
    <BacklogClient
      items={items}
      retentionDays={retentionDays}
      capped={capped}
      perSourceCap={perSourceCap}
    />
  );
}

function DenyCard({
  reason,
  role,
}: {
  reason: "signin" | "forbidden";
  role?: string;
}) {
  if (reason === "signin") {
    return (
      <div className="glass-card p-10 text-center space-y-4 max-w-md mx-auto mt-10">
        <div className="text-4xl">🔒</div>
        <h2 className="text-lg font-semibold">Sign in required</h2>
        <p className="text-sm text-muted">The Backlog is available to agent and admin accounts.</p>
        <Link
          href="/auth/signin"
          className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent"
        >
          Sign In
        </Link>
      </div>
    );
  }
  return (
    <div className="glass-card p-10 text-center space-y-4 max-w-md mx-auto mt-10">
      <div className="text-4xl">⛔</div>
      <h2 className="text-lg font-semibold">Access restricted</h2>
      <p className="text-sm text-muted">
        The Trade Setup Backlog is available to{" "}
        <span className="font-medium text-foreground">{ROLE_LABELS.agent}</span> and{" "}
        <span className="font-medium text-foreground">{ROLE_LABELS.admin}</span> accounts.
        {role ? (
          <>
            {" "}Your current role: <span className="font-medium text-foreground">{ROLE_LABELS[normalizeRole(role)]}</span>.
          </>
        ) : null}
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
