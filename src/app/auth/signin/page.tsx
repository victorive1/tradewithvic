"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { Navbar } from "@/components/landing/Navbar";

function resolveCallbackUrl(): string {
  if (typeof window === "undefined") return "/dashboard";
  const raw = new URLSearchParams(window.location.search).get("callbackUrl");
  // Allow only same-origin relative paths to prevent open-redirect abuse.
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

export default function SignInPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");

  useEffect(() => {
    setCallbackUrl(resolveCallbackUrl());
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    try {
      const res = await fetch("/api/auth/register", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid credentials");
      } else {
        localStorage.setItem("user", JSON.stringify(data));
        window.location.href = callbackUrl;
      }
    } catch {
      setError("Something went wrong");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
        <div className="orb w-[500px] h-[500px] bg-accent/20 -top-40 -right-40" />
        <div className="orb w-[400px] h-[400px] bg-accent/10 bottom-20 -left-40" />
        <div className="orb w-[300px] h-[300px] bg-bull/10 top-1/2 right-1/4" />
        <div className="grid-bg absolute inset-0" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — branding */}
            <div className="hidden lg:block max-w-2xl">
              <div className="animate-fade-in-up">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent-light text-sm mb-6">
                  <span className="w-2 h-2 rounded-full bg-bull pulse-live" />
                  Members Portal
                </div>
              </div>
              <h1 className="text-5xl lg:text-6xl font-bold tracking-tight mb-6 animate-fade-in-up-delay-1">
                Welcome back to{" "}
                <span className="gradient-text-accent">Smarter Trading</span>
              </h1>
              <p className="text-lg text-muted-light max-w-xl mb-8 leading-relaxed animate-fade-in-up-delay-2">
                Sign in to access your dashboard — real-time market intelligence,
                curated setups, and your trading hub in one place.
              </p>
              <div className="flex gap-6 animate-fade-in-up-delay-3">
                {["Real-time data", "Multi-market", "AI-powered setups"].map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                    <span className="text-xs text-muted">{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — auth card */}
            <div className="animate-fade-in-up-delay-3">
              <div className="glass-card p-8 sm:p-10 w-full max-w-md mx-auto lg:ml-auto">
                <div className="lg:hidden mb-6 flex justify-center">
                  <Logo size="md" />
                </div>

                <h2 className="text-2xl font-bold mb-1">Sign in</h2>
                <p className="text-sm text-muted mb-8">Access your market dashboard</p>

                {error && (
                  <p className="text-xs text-bear-light bg-bear/10 border border-bear/30 rounded-lg px-3 py-2 mb-4">
                    {error}
                  </p>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-light mb-1.5 block">Username or Email</label>
                    <input
                      type="text"
                      name="email"
                      required
                      className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder-muted transition-smooth"
                      placeholder="Username or email"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-muted-light mb-1.5 block">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
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
        </div>
      </section>
    </div>
  );
}
