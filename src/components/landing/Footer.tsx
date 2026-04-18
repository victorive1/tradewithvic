"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const links: Record<string, { label: string; href: string }[]> = {
  Product: [
    { label: "Market Radar", href: "/dashboard" },
    { label: "Trade Setups", href: "/dashboard/setups" },
    { label: "Liquidity Maps", href: "/dashboard/liquidity" },
    { label: "Smart Money", href: "/dashboard/sharp-money" },
  ],
  Markets: [
    { label: "Forex", href: "/dashboard/screener" },
    { label: "Metals", href: "/dashboard/screener" },
    { label: "Indices", href: "/dashboard/screener" },
    { label: "Crypto", href: "/dashboard/screener" },
    { label: "Energy", href: "/dashboard/screener" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Pricing", href: "/dashboard/billing" },
    { label: "Contact", href: "/contact" },
    { label: "Blog", href: "/blog" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-surface/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Logo size="sm" />
            <p className="text-sm text-muted mt-4 max-w-xs">
              Real-time trading intelligence for modern traders.
            </p>
          </div>
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-foreground mb-4">
                {category}
              </h4>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-sm text-muted hover:text-muted-light transition-smooth"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 mt-12 pt-8 text-center">
          <p className="text-xs text-muted">
            &copy; {new Date().getFullYear()} TradeWithVic App. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
