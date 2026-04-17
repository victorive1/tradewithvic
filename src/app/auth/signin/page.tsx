"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";

const floatingCards = [
  { symbol: "EUR/USD", bias: "Bearish", confidence: "78%" },
  { symbol: "XAU/USD", bias: "Bullish", confidence: "85%" },
  { symbol: "NAS100", bias: "Bullish", confidence: "72%" },
];

export default function SignInPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    // TODO: Wire up NextAuth credentials sign-in
    setTimeout(() => setLoading(false), 1500);
  }

  return (
    <div className="min-h-screen bg-background grid-bg flex">
      {/* Orb decorations */}
      <div className="orb w-[400px] h-[400px] bg-accent/15 -top-20 -left-20" />
      <div className="orb w-[300px] h-[300px] bg-bull/10 bottom-20 right-10" />

      {/* Left Side - Branding */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-16 relative">
        <div className="max-w-md">
          <Logo size="lg" />
          <h1 className="text-3xl font-bold mt-8 mb-4">
            Real-Time Market Intelligence,{" "}
            <span className="gradient-text-accent">All in One Place</span>
          </h1>
          <p className="text-muted-light leading-relaxed mb-8">
            Analyze forex, metals, indices, and crypto with real-time insights,
            clean setups, and a modern decision-focused trading experience.
          </p>

          {/* Floating mini cards */}
          <div className="space-y-3">
            {floatingCards.map((card) => (
              <div
                key={card.symbol}
                className="glass-card p-3 flex items-center justify-between max-w-xs"
              >
                <span className="text-sm font-medium">{card.symbol}</span>
                <span
                  className={`text-xs ${
                    card.bias === "Bullish" ? "text-bull-light" : "text-bear-light"
                  }`}
                >
                  {card.bias}
                </span>
                <span className="text-xs text-accent-light">{card.confidence}</span>
              </div>
            ))}
          </div>

          {/* Trust bullets */}
          <div className="flex gap-6 mt-8">
            {["Real-time data", "Multi-market", "AI-powered setups"].map((t) => (
              <div key={t} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-xs text-muted">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Auth Card */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8">
        <div className="glass-card p-8 sm:p-10 w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Logo size="md" />
          </div>

          <h2 className="text-2xl font-bold mb-1">Welcome back</h2>
          <p className="text-sm text-muted mb-8">
            Sign in to access your market dashboard
          </p>

          {/* Social sign-in */}
          <button className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-border-light bg-surface-2 transition-smooth mb-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span className="text-sm font-medium">Continue with Google</span>
          </button>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted">or sign in with email</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-muted-light mb-1.5 block">Email</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder-muted transition-smooth"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="text-sm text-muted-light mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder-muted transition-smooth pr-12"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-muted-light transition-smooth"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-border bg-surface-2 accent-accent" />
                <span className="text-xs text-muted">Remember me</span>
              </label>
              <Link href="/auth/forgot-password" className="text-xs text-accent-light hover:text-accent transition-smooth">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-smooth disabled:opacity-50 glow-accent"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-accent-light hover:text-accent font-medium transition-smooth">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
