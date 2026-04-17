"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/">
            <Logo size="sm" />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-muted-light hover:text-foreground transition-smooth">
              Features
            </Link>
            <Link href="#markets" className="text-sm text-muted-light hover:text-foreground transition-smooth">
              Markets
            </Link>
            <Link href="#how-it-works" className="text-sm text-muted-light hover:text-foreground transition-smooth">
              How It Works
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/auth/signin"
              className="text-sm text-muted-light hover:text-foreground transition-smooth px-4 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm font-medium bg-accent hover:bg-accent-light text-white px-5 py-2.5 rounded-xl transition-smooth"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
