"use client";

import { useCallback, useEffect, useState } from "react";
import { AccessGate } from "@/components/auth/AccessGate";
import { useCurrentUser } from "@/components/auth/useCurrentUser";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function roleBadgeClass(role: Role): string {
  switch (role) {
    case "admin":
      return "bg-bear/15 text-bear-light border-bear/40";
    case "agent":
      return "bg-accent/15 text-accent-light border-accent/40";
    case "algo_investor":
      return "bg-warn/15 text-warn border-warn/40";
    case "user":
    default:
      return "bg-surface-2 text-muted-light border-border/50";
  }
}

function AdminPortalBody() {
  const { user: currentUser } = useCurrentUser();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `http_${res.status}`);
      }
      const data = (await res.json()) as { users: AdminUserRow[] };
      setUsers(data.users);
    } catch (e) {
      setError((e as Error).message);
      setUsers([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeRole(row: AdminUserRow, nextRole: Role) {
    if (nextRole === row.role) return;
    if (row.id === currentUser?.id && nextRole !== "admin") {
      setError("You can't demote yourself. Ask another admin to change your role.");
      return;
    }
    setPendingId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: row.id, role: nextRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `http_${res.status}`);
      }
      setUsers((prev) =>
        prev ? prev.map((u) => (u.id === row.id ? { ...u, role: nextRole } : u)) : prev,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  const filtered = (users ?? []).filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      (u.name ?? "").toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const counts = (users ?? []).reduce<Record<Role, number>>(
    (acc, u) => { acc[u.role] = (acc[u.role] ?? 0) + 1; return acc; },
    { user: 0, agent: 0, algo_investor: 0, admin: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Portal</h1>
        <p className="text-sm text-muted mt-1">
          Manage user roles. Role changes take effect on the next request the user makes.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ROLES.map((r) => (
          <div key={r} className="glass-card p-4">
            <p className="text-[10px] text-muted tracking-[0.18em] uppercase">{ROLE_LABELS[r]}</p>
            <p className="text-2xl font-bold mt-1">{counts[r] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email, name, or role…"
          className="flex-1 max-w-md px-4 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm"
        />
        <button
          onClick={load}
          className="px-4 py-2.5 rounded-xl bg-surface-2 border border-border hover:border-border-light text-sm font-medium transition-smooth"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="glass-card p-3 text-xs text-warn border border-warn/30 flex items-center gap-2">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {users === null ? (
        <div className="glass-card p-12 text-center text-sm text-muted">Loading users…</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center text-sm text-muted">
          {users.length === 0 ? "No users yet." : "No matches for that search."}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/50 border-b border-border/60">
              <tr>
                <th className="text-left px-4 py-3 text-[11px] text-muted tracking-[0.12em] uppercase font-semibold">User</th>
                <th className="text-left px-4 py-3 text-[11px] text-muted tracking-[0.12em] uppercase font-semibold">Role</th>
                <th className="text-left px-4 py-3 text-[11px] text-muted tracking-[0.12em] uppercase font-semibold hidden md:table-cell">Joined</th>
                <th className="text-right px-4 py-3 text-[11px] text-muted tracking-[0.12em] uppercase font-semibold">Change role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isMe = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="border-b border-border/30 last:border-b-0 hover:bg-surface-2/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {u.name ?? u.email}
                        {isMe && <span className="ml-2 text-[10px] text-accent-light uppercase tracking-wider">you</span>}
                      </p>
                      {u.name && <p className="text-xs text-muted">{u.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border",
                        roleBadgeClass(u.role),
                      )}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted hidden md:table-cell">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <select
                        value={u.role}
                        disabled={pendingId === u.id}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                        className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border focus:border-accent focus:outline-none text-xs disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminPortalPage() {
  return (
    <AccessGate tag="admin">
      <AdminPortalBody />
    </AccessGate>
  );
}
