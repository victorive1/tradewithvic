"use client";

import { Logo } from "@/components/ui/Logo";

const links = {
  Product: ["Market Radar", "Trade Setups", "Liquidity Maps", "Smart Money"],
  Markets: ["Forex", "Metals", "Indices", "Crypto", "Energy"],
  Company: ["About", "Pricing", "Contact", "Blog"],
  Legal: ["Privacy Policy", "Terms of Service", "Cookie Policy"],
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
                  <li key={item}>
                    <span className="text-sm text-muted hover:text-muted-light cursor-pointer transition-smooth">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 mt-12 pt-8 text-center">
          <p className="text-xs text-muted">
            &copy; {new Date().getFullYear()} FX Wonders. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
