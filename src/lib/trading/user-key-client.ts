"use client";

const USER_STORAGE = "user";
const LEGACY_KEY = "tradewithvic_billing_user_key";

/**
 * Returns the key that scopes trading data (linked MT accounts, execution
 * history) for the current signed-in user. Derived from the email stored
 * in localStorage["user"] so every device the user signs in on sees the
 * same data.
 *
 * Returns "" when the user is not signed in — callers MUST treat that as
 * "no sync possible" and avoid making scoped API calls. Prior versions
 * fell back to a per-device random UUID, which silently desynced data
 * across devices and was the root cause of the "no accounts on file"
 * bug on mobile.
 */
export function getOrCreateUserKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(USER_STORAGE);
    if (!raw) return "";
    const u = JSON.parse(raw) as { email?: unknown };
    if (typeof u?.email === "string" && u.email.trim().length > 2) {
      return `email:${u.email.trim().toLowerCase()}`;
    }
  } catch {
    // malformed storage — treat as signed-out
  }
  return "";
}

/**
 * One-time cleanup: remove the legacy per-device UUID written by older
 * builds. Safe to call from anywhere on the client; noop on server.
 */
export function clearLegacyDeviceKey(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(LEGACY_KEY); } catch {}
}
