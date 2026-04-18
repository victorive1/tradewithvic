"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#markets", label: "Markets" },
  { href: "#how-it-works", label: "How it works" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "border-b border-border/80 bg-background/70 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_1px_0_rgba(255,255,255,0.03)]"
          : "border-b border-transparent bg-background/20 backdrop-blur-md"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center">
              <Logo size="sm" />
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="relative text-[13px] font-medium text-muted-light hover:text-foreground px-3 py-2 rounded-lg transition-smooth group"
                >
                  <span className="relative z-10">{l.label}</span>
                  <span className="absolute inset-0 rounded-lg bg-surface-2/0 group-hover:bg-surface-2/60 transition-smooth" />
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/auth/signin"
              className="hidden sm:inline-flex text-[13px] font-medium text-muted-light hover:text-foreground px-3 py-2 rounded-lg hover:bg-surface-2/60 transition-smooth"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="group relative inline-flex items-center gap-1.5 text-[13px] font-semibold text-white px-4 py-2 rounded-lg overflow-hidden transition-smooth"
              style={{
                background: "linear-gradient(135deg, var(--ac), var(--acd))",
                boxShadow: "0 4px 18px var(--acg), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <span className="relative">Get started</span>
              <svg className="relative w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
