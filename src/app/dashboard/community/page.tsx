"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type FeedTab = "foryou" | "following" | "trending" | "ideas" | "live";

interface Profile {
  id: string;
  userKey?: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarEmoji: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  tradingStyle: string | null;
}

interface Post {
  id: string;
  type: string;
  body: string;
  instrumentSymbol: string | null;
  timeframe: string | null;
  direction: string | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  confidenceScore: number | null;
  imageUrl: string | null;
  reactionCountsJson: string;
  commentCount: number;
  createdAt: string;
  author: Profile;
}

const REACTIONS: { key: string; emoji: string; label: string }[] = [
  { key: "like", emoji: "❤️", label: "Like" },
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "eyes", emoji: "👀", label: "Watching" },
  { key: "bullish", emoji: "🐂", label: "Bullish" },
  { key: "bearish", emoji: "🐻", label: "Bearish" },
  { key: "clap", emoji: "👏", label: "Clap" },
  { key: "rocket", emoji: "🚀", label: "Rocket" },
];

const USERKEY_STORAGE = "tradewithvic_community_user_key";

function getOrCreateUserKey(): string {
  if (typeof window === "undefined") return "";
  let key = window.localStorage.getItem(USERKEY_STORAGE);
  if (!key) {
    key = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `uk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(USERKEY_STORAGE, key);
  }
  return key;
}

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s); } catch { return fallback; }
}

export default function CommunityPage() {
  const [userKey, setUserKey] = useState("");
  const [me, setMe] = useState<Profile | null>(null);
  const [tab, setTab] = useState<FeedTab>("foryou");
  const [posts, setPosts] = useState<Post[]>([]);
  const [myReactions, setMyReactions] = useState<Record<string, string[]>>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerBody, setComposerBody] = useState("");
  const [composerType, setComposerType] = useState<"quick" | "discussion">("quick");
  const [composerSymbol, setComposerSymbol] = useState("");
  const [posting, setPosting] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftUsername, setDraftUsername] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [draftEmoji, setDraftEmoji] = useState("👤");
  const [profileError, setProfileError] = useState<string | null>(null);

  const auth = useMemo(() => ({
    "Content-Type": "application/json",
    "x-community-user-key": userKey,
  }), [userKey]);

  useEffect(() => {
    setUserKey(getOrCreateUserKey());
  }, []);

  const fetchMe = useCallback(async () => {
    if (!userKey) return;
    const res = await fetch("/api/community/me", { headers: auth, cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setMe(data);
      setDraftName(data.displayName ?? "");
      setDraftUsername(data.username ?? "");
      setDraftBio(data.bio ?? "");
      setDraftEmoji(data.avatarEmoji ?? "👤");
    }
  }, [userKey, auth]);

  const fetchFeed = useCallback(async () => {
    if (!userKey) return;
    const res = await fetch(`/api/community/feed?tab=${tab}`, { headers: auth, cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts ?? []);
      setMyReactions(data.reactions ?? {});
    }
  }, [userKey, tab, auth]);

  useEffect(() => { fetchMe(); }, [fetchMe]);
  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  async function handlePost() {
    if (!composerBody.trim() || posting) return;
    setPosting(true);
    try {
      await fetch("/api/community/posts", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          type: composerType,
          body: composerBody,
          instrumentSymbol: composerSymbol || undefined,
        }),
      });
      setComposerBody("");
      setComposerSymbol("");
      setComposerOpen(false);
      await Promise.all([fetchFeed(), fetchMe()]);
    } finally { setPosting(false); }
  }

  async function toggleReaction(postId: string, reaction: string) {
    const res = await fetch(`/api/community/posts/${postId}/reactions`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ reaction }),
    });
    if (res.ok) {
      const data = await res.json();
      // update local state quickly
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, reactionCountsJson: JSON.stringify(data.counts) } : p));
      setMyReactions((prev) => {
        const current = prev[postId] ?? [];
        const next = data.reacted
          ? [...current.filter((r) => r !== reaction), reaction]
          : current.filter((r) => r !== reaction);
        return { ...prev, [postId]: next };
      });
    }
  }

  async function saveProfile() {
    setProfileError(null);
    const res = await fetch("/api/community/me", {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({
        displayName: draftName,
        username: draftUsername,
        bio: draftBio,
        avatarEmoji: draftEmoji,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setProfileError(err.error ?? `Save failed (${res.status})`);
      return;
    }
    const data = await res.json();
    setMe(data);
    setProfileOpen(false);
  }

  const tabs: { id: FeedTab; label: string }[] = [
    { id: "foryou", label: "For You" },
    { id: "following", label: "Following" },
    { id: "trending", label: "Trending" },
    { id: "ideas", label: "Ideas" },
    { id: "live", label: "Live" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Community</h1>
          <p className="text-sm text-muted mt-1">Market-native social network · share setups, follow traders, discuss instruments</p>
        </div>
        {me && (
          <button
            onClick={() => setProfileOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border/50 hover:border-accent transition-smooth"
          >
            <span className="text-xl">{me.avatarEmoji}</span>
            <div className="text-left">
              <div className="text-xs font-semibold">@{me.username}</div>
              <div className="text-[10px] text-muted">{me.followerCount} followers · {me.postCount} posts</div>
            </div>
          </button>
        )}
      </div>

      {/* Composer */}
      <section className="glass-card p-4">
        {!composerOpen ? (
          <button
            onClick={() => setComposerOpen(true)}
            className="w-full flex items-center gap-3 text-left text-sm text-muted hover:text-foreground"
          >
            <span className="text-xl">{me?.avatarEmoji ?? "👤"}</span>
            <span className="flex-1 px-3 py-2 bg-surface-2 rounded-lg">What's the market telling you?</span>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setComposerType("quick")}
                className={cn("px-3 py-1 rounded-full text-xs border", composerType === "quick" ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
                💬 Quick Post
              </button>
              <button onClick={() => setComposerType("discussion")}
                className={cn("px-3 py-1 rounded-full text-xs border", composerType === "discussion" ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
                📰 Discussion
              </button>
            </div>
            <textarea
              autoFocus
              value={composerBody}
              onChange={(e) => setComposerBody(e.target.value)}
              placeholder={composerType === "discussion" ? "Start a thread… longer takes welcome." : "Quick market thought…"}
              rows={composerType === "discussion" ? 6 : 3}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={composerSymbol}
                onChange={(e) => setComposerSymbol(e.target.value.toUpperCase())}
                placeholder="Instrument (e.g. XAUUSD)"
                className="w-40 px-3 py-1.5 rounded-lg bg-surface-2 border border-border focus:border-accent focus:outline-none text-xs font-mono"
              />
              <span className="text-[11px] text-muted ml-auto">{composerBody.length}/4000</span>
              <button onClick={() => setComposerOpen(false)} className="px-3 py-1.5 text-xs text-muted hover:text-foreground">Cancel</button>
              <button onClick={handlePost} disabled={!composerBody.trim() || posting}
                className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50">
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Feed tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth",
              tab === t.id ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <section className="space-y-3">
        {posts.length === 0 ? (
          <div className="glass-card p-10 text-center space-y-2">
            <div className="text-3xl">🗣</div>
            <p className="text-sm text-muted">
              {tab === "following" ? "You're not following anyone yet. Switch to For You to discover voices." : "No posts yet. Be the first — what's the market telling you?"}
            </p>
          </div>
        ) : posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            myReactions={myReactions[post.id] ?? []}
            onReact={(r) => toggleReaction(post.id, r)}
          />
        ))}
      </section>

      {/* Profile editor */}
      {profileOpen && me && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setProfileOpen(false)}>
          <div className="glass-card p-6 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your Profile</h2>
              <button onClick={() => setProfileOpen(false)} className="text-muted">×</button>
            </div>
            <div className="flex items-center gap-3">
              <input type="text" value={draftEmoji} onChange={(e) => setDraftEmoji(e.target.value.slice(0, 2))}
                className="w-16 text-center text-2xl px-2 py-1.5 rounded-lg bg-surface-2 border border-border" />
              <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Display name"
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm" />
            </div>
            <input type="text" value={draftUsername} onChange={(e) => setDraftUsername(e.target.value.toLowerCase())}
              placeholder="username (a-z, 0-9, _)"
              className="w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm font-mono" />
            <textarea value={draftBio} onChange={(e) => setDraftBio(e.target.value)} placeholder="Bio — trading style, focus markets, experience…" rows={3}
              className="w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm" />
            {profileError && <div className="text-xs text-bear-light">{profileError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setProfileOpen(false)} className="px-3 py-1.5 text-xs text-muted">Cancel</button>
              <button onClick={saveProfile} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold">Save</button>
            </div>
            <p className="text-[10px] text-muted">Your community identity is tied to this browser. Claude Code auth will move it to your full account later.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, myReactions, onReact }: { post: Post; myReactions: string[]; onReact: (r: string) => void }) {
  const counts = safeParse<Record<string, number>>(post.reactionCountsJson, {});
  const typeLabel = post.type === "idea" ? "IDEA" : post.type === "discussion" ? "DISCUSSION" : post.type === "chart" ? "CHART" : "POST";
  const isBull = post.direction === "bullish";
  return (
    <article className="glass-card p-4">
      <header className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{post.author.avatarEmoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/dashboard/community/${post.author.username}`} className="text-sm font-semibold hover:underline">
              {post.author.displayName}
            </Link>
            <span className="text-xs text-muted">@{post.author.username}</span>
            <span className="text-xs text-muted">·</span>
            <span className="text-xs text-muted">{timeAgo(post.createdAt)} ago</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-surface-2 text-muted-light uppercase tracking-wider ml-auto">{typeLabel}</span>
          </div>
        </div>
      </header>

      {post.instrumentSymbol && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-accent/10 text-accent-light">{post.instrumentSymbol}</span>
          {post.timeframe && <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-surface-2 text-muted">{post.timeframe}</span>}
          {post.direction && <span className={cn("text-[10px] font-mono uppercase px-2 py-0.5 rounded",
            isBull ? "bg-bull/10 text-bull-light" : "bg-bear/10 text-bear-light")}>
            {isBull ? "LONG" : "SHORT"}
          </span>}
          {post.confidenceScore !== null && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-2 text-muted">{post.confidenceScore}/100</span>
          )}
        </div>
      )}

      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{post.body}</p>

      {(post.entry !== null || post.stopLoss !== null || post.takeProfit1 !== null) && (
        <div className="mt-3 flex items-center gap-3 text-xs font-mono bg-surface-2 rounded-lg p-2">
          {post.entry !== null && <span>Entry <span className="text-foreground">{post.entry}</span></span>}
          {post.stopLoss !== null && <span>SL <span className="text-bear-light">{post.stopLoss}</span></span>}
          {post.takeProfit1 !== null && <span>TP1 <span className="text-bull-light">{post.takeProfit1}</span></span>}
        </div>
      )}

      <footer className="mt-3 flex items-center gap-1.5 flex-wrap">
        {REACTIONS.map((r) => {
          const active = myReactions.includes(r.key);
          const count = counts[r.key] ?? 0;
          return (
            <button key={r.key} onClick={() => onReact(r.key)}
              className={cn("flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] transition-smooth",
                active ? "border-accent/40 bg-accent/10 text-accent-light" : "border-border/40 bg-surface-2/60 text-muted-light hover:border-border-light")}
              title={r.label}>
              <span>{r.emoji}</span>
              {count > 0 && <span className="font-mono">{count}</span>}
            </button>
          );
        })}
        <span className="text-[11px] text-muted ml-auto">{post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}</span>
      </footer>
    </article>
  );
}
