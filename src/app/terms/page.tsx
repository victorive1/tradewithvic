import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted mb-8">Last updated: April 17, 2026</p>
        <div className="space-y-6 text-sm text-muted-light leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Acceptance of Terms</h2>
            <p>By accessing and using TradeWithVic ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Platform.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Description of Service</h2>
            <p>TradeWithVic provides trading intelligence tools including market analysis, trade setups, signal generation, and algorithmic trading features. The Platform is for informational and educational purposes only.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. No Financial Advice</h2>
            <p>Nothing on this Platform constitutes financial, investment, or trading advice. All trade setups, signals, and analysis are generated algorithmically and should not be relied upon as the sole basis for any trading decision. Trading involves substantial risk of loss. Past performance does not guarantee future results.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Account Responsibility</h2>
            <p>You are responsible for maintaining the security of your account credentials. You are solely responsible for all activities that occur under your account, including any trading decisions made using the Platform's tools.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Subscription & Billing</h2>
            <p>Paid plans are billed according to the pricing displayed at the time of purchase. You may cancel at any time. Refunds are handled on a case-by-case basis within 14 days of purchase.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Prohibited Use</h2>
            <p>You may not reverse-engineer, redistribute, or resell any data, signals, or analysis provided by the Platform. You may not use automated tools to scrape or extract data beyond what is provided through the Platform's interface.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Limitation of Liability</h2>
            <p>TradeWithVic and its operators shall not be liable for any trading losses, missed opportunities, or damages arising from the use of the Platform. The Platform is provided "as is" without warranties of any kind.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">8. Changes to Terms</h2>
            <p>We reserve the right to modify these terms at any time. Continued use of the Platform after changes constitutes acceptance of the updated terms.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
