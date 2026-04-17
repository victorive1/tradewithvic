"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";

export default function SignUpPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const email = form.get("email") as string;
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;

    if (password !== confirm) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
      } else {
        window.location.href = "/auth/signin";
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background grid-bg flex">
      <div className="orb w-[400px] h-[400px] bg-accent/15 -top-20 -right-20" />
      <div className="orb w-[300px] h-[300px] bg-bull/10 bottom-10 left-10" />

      {/* Left Side - Branding */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-16 relative">
        <div className="max-w-md">
          <Logo size="lg" />
          <h1 className="text-3xl font-bold mt-8 mb-4">
            Start Trading with{" "}
            <span className="gradient-text-accent">Better Insight</span>
          </h1>
          <p className="text-muted-light leading-relaxed mb-8">
            Get access to real-time market intelligence across forex, metals,
            indices, and crypto. Clean insights, confidence-driven setups.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Markets Covered", value: "22+" },
              { label: "Asset Classes", value: "5" },
              { label: "Trade Modules", value: "30+" },
              { label: "Setup Quality", value: "A+" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card p-4 text-center">
                <div className="text-xl font-bold gradient-text-accent">{stat.value}</div>
                <div className="text-xs text-muted mt-1">{stat.label}</div>
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

          <h2 className="text-2xl font-bold mb-1">Create your account</h2>
          <p className="text-sm text-muted mb-8">
            Start exploring the markets smarter
          </p>

          <button className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-border-light bg-surface-2 transition-smooth mb-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span className="text-sm font-medium">Continue with Google</span>
          </button>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted">or register with email</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-muted-light mb-1.5 block">Full Name</label>
              {error && <p className="text-xs text-bear-light mb-2">{error}</p>}
              <input
                type="text"
                name="name"
                required
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder-muted transition-smooth"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="text-sm text-muted-light mb-1.5 block">Email</label>
              <input
                type="email"
                name="email"
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
                  name="password"
                  required
                  minLength={8}
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder-muted transition-smooth pr-12"
                  placeholder="Create a password (min 8 characters)"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-muted-light transition-smooth"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-light mb-1.5 block">Confirm Password</label>
              <input
                type="password"
                name="confirm"
                required
                minLength={8}
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder-muted transition-smooth"
                placeholder="Confirm your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-smooth disabled:opacity-50 glow-accent"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-accent-light hover:text-accent font-medium transition-smooth">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
