"use client";

import { useEffect, useRef, useState } from "react";

// useStableSetups merges incoming setup arrays in-place so existing cards
// never reshuffle while the user is interacting with them. Ordering rules:
//
//   1. Setups already in the list KEEP their position even if their
//      confidenceScore changes within the same grade tier. A score moving
//      from 86 → 88 doesn't bump the card up the page — the underlying
//      props update silently.
//   2. Setups whose grade tier changed (e.g. crossed the 75 boundary)
//      keep their slot too — the grade-change indicator shows the move
//      visually instead of reshuffling.
//   3. New setups are appended to the END of the list. Trader scans from
//      top of page and sees newcomers below the cards they were already
//      reading.
//   4. Setups that disappear from the server snapshot are removed from
//      the list. (Keeping them visible would mislead the trader into
//      thinking they're still active.)
//   5. Optional `paused` flag — when true, the visible list does not
//      update at all. Used by pages that pause refresh while the user is
//      hovering a card (so SL/entry numbers don't shift while they're
//      copying them).
//
// `getId` lets the hook work with any setup-shaped record (TradeSetup,
// Breakout, etc.). The id is whatever stays stable across refreshes —
// see setup-engine.ts and breakouts/page.tsx for how they're constructed.

export interface StableUpdate<T> {
  items: T[];
  // Items where score / grade changed since the last snapshot — useful
  // for adding visual "↑/↓" indicators on existing cards.
  changedIds: Set<string>;
}

export function useStableSetups<T extends { confidenceScore?: number; score?: number; qualityGrade?: string; confidence?: string }>(
  incoming: T[],
  getId: (item: T) => string,
  paused: boolean = false,
): StableUpdate<T> {
  const [order, setOrder] = useState<string[]>([]);
  const [byId, setById] = useState<Map<string, T>>(new Map());
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const prevSnapshot = useRef<Map<string, T>>(new Map());

  useEffect(() => {
    if (paused) return;

    const incomingMap = new Map<string, T>();
    for (const item of incoming) incomingMap.set(getId(item), item);

    // Compute which items changed score/grade since last refresh.
    const newlyChanged = new Set<string>();
    for (const [id, next] of incomingMap) {
      const prev = prevSnapshot.current.get(id);
      if (!prev) continue; // brand-new item; no "change" to indicate
      const prevScore = (prev.confidenceScore ?? prev.score ?? 0) as number;
      const nextScore = (next.confidenceScore ?? next.score ?? 0) as number;
      const prevGrade = (prev.qualityGrade ?? prev.confidence ?? "") as string;
      const nextGrade = (next.qualityGrade ?? next.confidence ?? "") as string;
      if (Math.abs(nextScore - prevScore) >= 1 || prevGrade !== nextGrade) {
        newlyChanged.add(id);
      }
    }

    // Update stable order: existing surviving IDs first (in their existing
    // slots), then any new IDs at the end.
    setOrder((prevOrder) => {
      const surviving = prevOrder.filter((id) => incomingMap.has(id));
      const survivingSet = new Set(surviving);
      const incomingIds = incoming.map(getId);
      const newOnes = incomingIds.filter((id) => !survivingSet.has(id));
      return [...surviving, ...newOnes];
    });

    setById(incomingMap);
    setChangedIds(newlyChanged);
    prevSnapshot.current = incomingMap;

    // Auto-clear the "changed" indicator after a short window so the
    // pulse/arrow doesn't stick on cards forever.
    if (newlyChanged.size > 0) {
      const timer = window.setTimeout(() => setChangedIds(new Set()), 8_000);
      return () => window.clearTimeout(timer);
    }
  }, [incoming, getId, paused]);

  const items = order.map((id) => byId.get(id)).filter((x): x is T => x !== undefined);
  return { items, changedIds };
}
