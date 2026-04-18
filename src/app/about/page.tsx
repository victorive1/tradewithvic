import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
        <h1 className="text-4xl font-bold mb-6">About TradeWithVic</h1>
        <div className="space-y-6 text-muted-light leading-relaxed">
          <p>
            TradeWithVic is a multi-market trading intelligence platform built for serious traders who want real-time, data-driven insights across forex, metals, indices, energy, and crypto markets.
          </p>
          <p>
            Our platform combines live market data, structural analysis, currency strength metrics, signal generation, and algorithmic trading tools into one unified experience. Every feature is designed to help you make faster, more confident trading decisions.
          </p>
          <h2 className="text-2xl font-semibold text-foreground pt-4">Our Mission</h2>
          <p>
            To give every trader access to institutional-grade market intelligence. We believe that better tools lead to better decisions, and better decisions lead to better outcomes.
          </p>
          <h2 className="text-2xl font-semibold text-foreground pt-4">What We Offer</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>Real-time market radar across 22+ instruments</li>
            <li>AI-powered trade setups with confidence scoring</li>
            <li>Market structure engine with swing detection and BOS/MSS events</li>
            <li>Currency strength analysis from live cross-pair movements</li>
            <li>Multi-timeframe analysis and directional bias engine</li>
            <li>Algo trading bots with full configuration control</li>
            <li>MT4/MT5 integration with 72+ brokers</li>
            <li>Custom signal and bot builders</li>
          </ul>
          <h2 className="text-2xl font-semibold text-foreground pt-4">Built by Traders, for Traders</h2>
          <p>
            TradeWithVic was created by Victor — a trader and developer who understood the gap between what trading platforms offer and what traders actually need. Every feature reflects real trading workflows and real market analysis needs.
          </p>
          <div className="pt-6">
            <Link href="/dashboard" className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold transition-smooth">
              Explore the Dashboard
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
