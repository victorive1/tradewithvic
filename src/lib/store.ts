// In-memory data store for serverless deployment
// Replace with Vercel Postgres/Supabase/PlanetScale for production persistence

interface WatchlistItem {
  id: string;
  userId: string;
  symbol: string;
  createdAt: string;
}

interface AlertItem {
  id: string;
  userId: string;
  symbol: string;
  alertType: string;
  condition: string;
  message: string | null;
  isTriggered: boolean;
  isActive: boolean;
  createdAt: string;
}

interface UserPref {
  userId: string;
  favoriteMarkets: string[];
  defaultTimeframe: string;
  language: string;
}

// Global stores (persist within single serverless instance)
const watchlists = new Map<string, WatchlistItem[]>();
const alerts = new Map<string, AlertItem[]>();
const preferences = new Map<string, UserPref>();

let idCounter = 0;
function genId() { return `item_${Date.now()}_${++idCounter}`; }

// ===== WATCHLIST =====
export function getWatchlist(userId: string): WatchlistItem[] {
  return watchlists.get(userId) || [];
}

export function addToWatchlist(userId: string, symbol: string): WatchlistItem {
  const list = watchlists.get(userId) || [];
  const existing = list.find((i) => i.symbol === symbol);
  if (existing) return existing;
  const item: WatchlistItem = { id: genId(), userId, symbol, createdAt: new Date().toISOString() };
  list.push(item);
  watchlists.set(userId, list);
  return item;
}

export function removeFromWatchlist(userId: string, symbol: string): boolean {
  const list = watchlists.get(userId) || [];
  const filtered = list.filter((i) => i.symbol !== symbol);
  watchlists.set(userId, filtered);
  return filtered.length < list.length;
}

// ===== ALERTS =====
export function getAlerts(userId: string): AlertItem[] {
  return (alerts.get(userId) || []).filter((a) => a.isActive);
}

export function createAlert(userId: string, data: { symbol: string; alertType: string; condition: any; message?: string }): AlertItem {
  const list = alerts.get(userId) || [];
  const item: AlertItem = {
    id: genId(), userId, symbol: data.symbol, alertType: data.alertType,
    condition: JSON.stringify(data.condition || {}), message: data.message || null,
    isTriggered: false, isActive: true, createdAt: new Date().toISOString(),
  };
  list.push(item);
  alerts.set(userId, list);
  return item;
}

export function deleteAlert(alertId: string): boolean {
  for (const [userId, list] of alerts.entries()) {
    const item = list.find((a) => a.id === alertId);
    if (item) { item.isActive = false; return true; }
  }
  return false;
}

// ===== PREFERENCES =====
export function getPreferences(userId: string): UserPref | null {
  return preferences.get(userId) || null;
}

export function savePreferences(userId: string, data: Partial<UserPref>): UserPref {
  const existing = preferences.get(userId) || { userId, favoriteMarkets: [], defaultTimeframe: "1h", language: "en" };
  const updated = { ...existing, ...data, userId };
  preferences.set(userId, updated);
  return updated;
}
