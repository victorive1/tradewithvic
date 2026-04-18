"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

const USERKEY_STORAGE = "tradewithvic_community_user_key";

export default function CommunityProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username;
  const [userKey, setUserKey] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUserKey(window.localStorage.getItem(USERKEY_STORAGE) ?? "");
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/community/profile/${username}`, {
        headers: userKey ? { "x-community-user-key": userKey } : {},
        cache: "no-store",
      });
      if (!res.ok) { setProfile(null); return; }
      const data = await res.json();
      setProfile(data);
    } finally {
      setLoading(false);
    }
  }, [username, userKey]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function toggleFollow() {
    if (!profile || !userKey) return;
    const res = await fetch("/api/community/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-community-user-key": userKey },
      body: JSON.stringify({ username: profile.username }),
    });
    if (res.ok) {
      const { following } = await res.json();
      setProfile({ ...profile, isFollowing: following, followerCount: profile.followerCount + (following ? 1 : -1) });
    }
  }

  if (loading) return <div className="glass-card p-12 text-center text-muted">Loading profile…</div>;
  if (!profile) return (
    <div className="glass-card p-10 text-center space-y-2">
      <div className="text-3xl">🔍</div>
      <p className="text-sm text-muted">Profile @{username} not found.</p>
      <Link href="/dashboard/community" className="text-xs text-accent-light underline underline-offset-4">Back to feed →</Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/community" className="text-xs text-muted hover:text-foreground underline underline-offset-4">← Community</Link>
      </div>

      <section className="glass-card p-6">
        <div className="flex items-start gap-4">
          <span className="text-5xl">{profile.avatarEmoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{profile.displayName}</h1>
            <div className="text-xs text-muted font-mono">@{profile.username}</div>
            {profile.bio && <p className="mt-3 text-sm text-muted-light whitespace-pre-wrap">{profile.bio}</p>}
            <div className="mt-3 flex items-center gap-4 text-xs text-muted">
              <span><span className="text-foreground font-semibold">{profile.followerCount}</span> followers</span>
              <span><span className="text-foreground font-semibold">{profile.followingCount}</span> following</span>
              <span><span className="text-foreground font-semibold">{profile.postCount}</span> posts</span>
            </div>
          </div>
          {!profile.isSelf && (
            <button onClick={toggleFollow}
              className={cn("px-4 py-1.5 rounded-full text-xs font-semibold transition-smooth border",
                profile.isFollowing ? "bg-surface-2 border-border/50 text-muted-light" : "bg-accent border-accent text-white hover:bg-accent-light")}>
              {profile.isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted font-semibold">Recent posts</h2>
        {profile.posts?.length === 0 ? (
          <div className="glass-card p-10 text-center text-muted text-sm">No posts yet.</div>
        ) : profile.posts.map((post: any) => (
          <article key={post.id} className="glass-card p-4">
            <div className="flex items-center justify-between text-xs text-muted mb-2">
              <span className="uppercase tracking-wider">{post.type}</span>
              <span>{new Date(post.createdAt).toLocaleString()}</span>
            </div>
            {post.instrumentSymbol && (
              <div className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-accent/10 text-accent-light inline-block mb-2">
                {post.instrumentSymbol} {post.timeframe ?? ""}
              </div>
            )}
            <p className="text-sm whitespace-pre-wrap">{post.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
