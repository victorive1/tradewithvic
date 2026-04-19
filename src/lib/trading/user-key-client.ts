"use client";

const LEGACY_KEY = "tradewithvic_billing_user_key";
const USER_STORAGE = "user";

/**
 * Returns the key that scopes all trading data (linked MT accounts, execution
 * history, pending orders) for the current browser.
 *
 * When the user is signed in we derive the key from their email so every
 * device they sign in on sees the same data. Otherwise we fall back to a
 * per-device random UUID kept in localStorage.
 */
export function getOrCreateUserKey(): string {
  if (typeof window === "undefined") return "";

  try {
    const raw = window.localStorage.getItem(USER_STORAGE);
    if (raw) {
      const u = JSON.parse(raw) as { email?: unknown };
      if (typeof u?.email === "string" && u.email.length > 2) {
        return `email:${u.email.trim().toLowerCase()}`;
      }
    }
  } catch {
    // fall through to anonymous key
  }

  let k = window.localStorage.getItem(LEGACY_KEY);
  if (!k) {
    k = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `uk_${Date.now()}`;
    window.localStorage.setItem(LEGACY_KEY, k);
  }
  return k;
}
