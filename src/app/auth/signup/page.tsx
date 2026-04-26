"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { Navbar } from "@/components/landing/Navbar";

export default function SignUpPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [consentLegal, setConsentLegal] = useState(false);
  const [consentRisk, setConsentRisk] = useState(false);

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
    if (!consentLegal) {
      setError("Please confirm you've read the Privacy Policy and Terms of Service.");
      setLoading(false);
      return;
    }
    if (!consentRisk) {
      setError("Please acknowledge the trading-risk disclosure.");
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
                  Join the Platform
                </div>
              </div>
              <h1 className="text-5xl lg:text-6xl font-bold tracking-tight mb-6 animate-fade-in-up-delay-1">
                Start Trading with{" "}
                <span className="gradient-text-accent">Better Insight</span>
              </h1>
              <p className="text-lg text-muted-light max-w-xl mb-8 leading-relaxed animate-fade-in-up-delay-2">
                Get access to real-time market intelligence across forex, metals,
                indices, and crypto. Clean insights, confidence-driven setups.
              </p>

              <div className="grid grid-cols-2 gap-4 max-w-md animate-fade-in-up-delay-3">
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

            {/* Right — auth card */}
            <div className="animate-fade-in-up-delay-3">
              <div className="glass-card p-8 sm:p-10 w-full max-w-md mx-auto lg:ml-auto">
                <div className="lg:hidden mb-6 flex justify-center">
                  <Logo size="md" />
                </div>

                <h2 className="text-2xl font-bold mb-1">Create your account</h2>
                <p className="text-sm text-muted mb-8">Start exploring the markets smarter</p>

                {error && (
                  <p className="text-xs text-bear-light bg-bear/10 border border-bear/30 rounded-lg px-3 py-2 mb-4">
                    {error}
                  </p>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-light mb-1.5 block">Full Name</label>
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

                  <div className="space-y-2.5 pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-muted-light leading-relaxed">
                      <input
                        type="checkbox"
                        checked={consentLegal}
                        onChange={(e) => setConsentLegal(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-border bg-surface-2 text-accent focus:ring-1 focus:ring-accent accent-accent shrink-0"
                      />
                      <span>
                        I have read and agree to the{" "}
                        <Link href="/privacy" target="_blank" className="text-accent-light hover:text-accent underline">
                          Privacy Policy
                        </Link>{" "}
                        and{" "}
                        <Link href="/terms" target="_blank" className="text-accent-light hover:text-accent underline">
                          Terms of Service
                        </Link>.
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-muted-light leading-relaxed">
                      <input
                        type="checkbox"
                        checked={consentRisk}
                        onChange={(e) => setConsentRisk(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-border bg-surface-2 text-accent focus:ring-1 focus:ring-accent accent-accent shrink-0"
                      />
                      <span>
                        I understand that trading leveraged products involves substantial risk
                        and that nothing on TradeWithVic is investment advice. Signals,
                        scores, and automated routing are decision-support tools only — I am
                        responsible for trades I authorize.
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !consentLegal || !consentRisk}
                    className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-smooth disabled:opacity-50 disabled:cursor-not-allowed glow-accent"
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
        </div>
      </section>
    </div>
  );
}
