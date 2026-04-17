"use client";

import Link from "next/link";

export function CTASection() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="orb w-[500px] h-[500px] bg-accent/15 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
        <h2 className="text-3xl sm:text-5xl font-bold mb-6">
          See the Market{" "}
          <span className="gradient-text-accent">More Clearly</span>
        </h2>
        <p className="text-muted-light text-lg max-w-xl mx-auto mb-10">
          Join traders who use real-time intelligence across forex, metals,
          indices, and crypto to make better decisions every day.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/signup"
            className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-lg transition-smooth glow-accent"
          >
            Create Free Account
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-8 py-4 rounded-xl border border-border hover:border-border-light text-foreground font-medium text-lg transition-smooth"
          >
            Explore the Platform
          </Link>
        </div>
      </div>
    </section>
  );
}
