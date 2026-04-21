/**
 * Role-based access control.
 *
 * A user has exactly one `Role`. Each role expands to a set of `AccessTag`s,
 * with additive inheritance:
 *   - `user`          → ["user"]
 *   - `agent`         → ["user", "agent"]
 *   - `algo_investor` → ["user", "algo_investor"]
 *   - `admin`         → ["user", "agent", "algo_investor", "admin"]
 *
 * Nav sections, pages, and API routes declare the tag they require.
 * hasAccess(role, tag) resolves whether the role grants the tag.
 */

export const ROLES = ["user", "agent", "algo_investor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ACCESS_TAGS = ["user", "agent", "algo_investor", "admin"] as const;
export type AccessTag = (typeof ACCESS_TAGS)[number];

const ROLE_TAGS: Record<Role, ReadonlyArray<AccessTag>> = {
  user: ["user"],
  agent: ["user", "agent"],
  algo_investor: ["user", "algo_investor"],
  admin: ["user", "agent", "algo_investor", "admin"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: unknown): Role {
  return isRole(value) ? value : "user";
}

export function tagsForRole(role: Role): ReadonlyArray<AccessTag> {
  return ROLE_TAGS[role];
}

export function hasAccess(role: Role | null | undefined, tag: AccessTag): boolean {
  if (!role) return false;
  return ROLE_TAGS[role].includes(tag);
}

/**
 * Human-readable labels for sidebar section headings and admin UIs.
 */
export const ROLE_LABELS: Record<Role, string> = {
  user: "User",
  agent: "Agent User",
  algo_investor: "Algo Investor",
  admin: "Admin",
};
