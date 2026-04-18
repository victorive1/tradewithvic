import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
        <h1 className="text-4xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-sm text-muted mb-8">Last updated: April 17, 2026</p>
        <div className="space-y-6 text-sm text-muted-light leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">What Are Cookies</h2>
            <p>Cookies are small text files stored on your device when you visit a website. They help the site remember your preferences and improve your experience.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Cookies We Use</h2>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li><strong>Essential cookies:</strong> Required for authentication, session management, and core platform functionality. These cannot be disabled.</li>
              <li><strong>Preference cookies:</strong> Store your theme preference (dark/light mode), dashboard layout, and display settings.</li>
              <li><strong>Analytics cookies:</strong> Help us understand how users interact with the Platform to improve features and performance. No personally identifiable information is collected.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Third-Party Cookies</h2>
            <p>TradingView chart widgets may set their own cookies. These are governed by TradingView's privacy policy. We do not control third-party cookies.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Managing Cookies</h2>
            <p>You can manage or delete cookies through your browser settings. Disabling essential cookies may affect the functionality of the Platform. Most browsers allow you to block or delete cookies under their privacy or security settings.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Contact</h2>
            <p>If you have questions about our use of cookies, contact us at support@tradewithvic.com.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
