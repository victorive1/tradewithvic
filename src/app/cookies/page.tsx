import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "Cookie Policy · TradeWithVic",
  description: "How TradeWithVic uses cookies and browser storage. Authoritative detail lives in section 11 of the Privacy Policy.",
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <h1 className="text-4xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-sm text-muted mb-10">Effective: April 25, 2026</p>

        <div className="space-y-6 text-sm text-muted-light leading-relaxed">
          <p>
            This is the short version. The full, authoritative cookie + browser-storage
            inventory lives in <Link href="/privacy" className="text-accent-light underline">section 11 of our Privacy Policy</Link>.
            We&rsquo;ve kept this page so footer links continue to resolve cleanly.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">What we use</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>One session cookie</strong>, used to keep you signed in. Required for the
                platform to function — disabling it means you can&rsquo;t use the dashboard.
              </li>
              <li>
                <strong>Per-device user key in localStorage</strong>, used to anonymously bind any
                pre-sign-in trade execution to your account when you create one.
              </li>
              <li>
                <strong>UI preferences in localStorage</strong> — theme, dismissed alerts, dashboard
                view choices. Convenience only; clear them at any time.
              </li>
              <li>
                <strong>First-party analytics</strong>, when enabled. Only counts of page views and
                timing — no third-party advertising tags, no fingerprinting.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Third-party widgets</h2>
            <p>
              Embedded TradingView chart widgets are loaded directly in your browser and may set
              their own cookies under{" "}
              <a href="https://www.tradingview.com/privacy-policy/" target="_blank" rel="noreferrer" className="text-accent-light underline">
                TradingView&rsquo;s privacy policy
              </a>
              . We never proxy that data through our servers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Managing your cookies</h2>
            <p>
              You can clear or block cookies through your browser settings. Note that blocking the
              session cookie will prevent you from signing in. Clearing localStorage will reset your
              theme, dismissed alerts, and any pre-sign-in trade-execution linkage on that device.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Questions</h2>
            <p>
              For anything beyond this summary, see the{" "}
              <Link href="/privacy" className="text-accent-light underline">Privacy Policy</Link>{" "}
              or email{" "}
              <a href="mailto:privacy@tradewithvic.com" className="text-accent-light underline">privacy@tradewithvic.com</a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
