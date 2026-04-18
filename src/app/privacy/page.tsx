import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted mb-8">Last updated: April 17, 2026</p>
        <div className="space-y-6 text-sm text-muted-light leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Information We Collect</h2>
            <p>We collect information you provide directly, including your name, email address, and trading preferences when you create an account. We also collect usage data such as pages visited, features used, and interaction patterns to improve the platform.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. How We Use Your Information</h2>
            <p>Your information is used to provide and improve our trading intelligence services, personalize your experience, send relevant notifications, and ensure platform security. We do not sell your personal data to third parties.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. Data Storage & Security</h2>
            <p>We use industry-standard encryption and security measures to protect your data. Trading account credentials (MT4/MT5) are stored locally on your device and are never transmitted to our servers.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Cookies</h2>
            <p>We use essential cookies to maintain your session and preferences. Analytics cookies help us understand platform usage. You can manage cookie preferences in your browser settings.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Third-Party Services</h2>
            <p>We use TwelveData for market data and TradingView for chart widgets. These services have their own privacy policies. We do not share your personal information with these providers.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Your Rights</h2>
            <p>You may request access to, correction of, or deletion of your personal data at any time by contacting us at support@tradewithvic.com. You may also export your data or close your account.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Changes</h2>
            <p>We may update this policy from time to time. We will notify you of any material changes via email or platform notification.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
