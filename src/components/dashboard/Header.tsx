"use client";

import Link from "next/link";
import { LastUpdated, LiveIndicator } from "@/components/ui/LastUpdated";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function DashboardHeader() {
  return (
    <header className="h-16 sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 relative isolate">
      {/* Blurred background — sits behind everything so content scrolls under */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-surface/70 backdrop-blur-2xl backdrop-saturate-150"
        style={{ boxShadow: "inset 0 -1px 0 var(--color-border)" }}
      />
      {/* Accent hairline — subtle gradient underline */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 right-0 h-px -z-10"
        style={{ background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent) 25%, transparent), transparent)" }}
      />

      <div className="flex items-center gap-3 sm:gap-4">
        <LiveIndicator />
        <LastUpdated />
      </div>

      <div className="flex items-center gap-2">
        <HeaderSearchButton />
        <ThemeToggle />
        <HeaderIconLink href="/dashboard/alerts" label="Alerts" hasBadge>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
        </HeaderIconLink>

        <HeaderIconLink href="/dashboard/settings" label="Settings">
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </HeaderIconLink>
      </div>
    </header>
  );
}

function HeaderIconLink({
  href,
  label,
  hasBadge,
  children,
}: {
  href: string;
  label: string;
  hasBadge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative w-10 h-10 rounded-xl bg-surface-2/60 border border-border hover:border-border-light hover:bg-surface-2 flex items-center justify-center transition-smooth text-muted hover:text-foreground"
    >
      {children}
      {hasBadge && (
        <>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-bull pulse-live" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-bull" />
        </>
      )}
    </Link>
  );
}

function HeaderSearchButton() {
  return (
    <button
      aria-label="Search"
      className="hidden md:flex items-center gap-2 h-10 px-3 rounded-xl bg-surface-2/60 border border-border hover:border-border-light transition-smooth text-muted hover:text-foreground text-xs"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <span className="text-muted">Search</span>
      <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-surface border border-border text-muted-light">⌘K</kbd>
    </button>
  );
}
