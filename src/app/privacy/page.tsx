import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "Privacy Policy · TradeWithVic",
  description: "How TradeWithVic collects, uses, stores, and shares information when you use the platform.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted mb-2">Effective: April 25, 2026</p>
        <p className="text-sm text-muted mb-10">
          This policy explains what TradeWithVic collects, why, who we share it with,
          and the rights you have over it. We&rsquo;ve written it in plain English on
          purpose &mdash; you&rsquo;re trusting us with money-adjacent data and you should
          be able to read this in one sitting.
        </p>

        {/* TL;DR ─────────────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-accent/20 bg-accent/5 p-6 mb-10 space-y-3 text-sm">
          <h2 className="text-base font-semibold text-foreground">At a glance</h2>
          <ul className="space-y-1.5 text-muted-light list-disc pl-5">
            <li>We collect what you give us (account, broker links, payment info), what we measure to run the product (usage, errors, the trades you sign off on), and what we compute about your trading (signals, scores, performance attribution).</li>
            <li>We <strong>do not sell</strong> your personal data and we <strong>do not advertise</strong> on our platform.</li>
            <li>Broker account credentials are encrypted at rest. Connections to your broker happen through your own Expert Advisor (&ldquo;EA&rdquo;) bridge or a marketplace adapter you authorize &mdash; we never trade without your routing rules.</li>
            <li>We use a small set of named processors (listed below) for hosting, payments, market data, news, email, and analytics &mdash; nothing more.</li>
            <li>You can export, correct, or delete your account data at any time. Email <a href="mailto:privacy@tradewithvic.com" className="text-accent-light underline">privacy@tradewithvic.com</a>.</li>
          </ul>
        </section>

        <div className="space-y-8 text-sm text-muted-light leading-relaxed">

          {/* 1. Who we are ──────────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Who we are</h2>
            <p>
              TradeWithVic (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is the operator of <strong>tradewithvic.com</strong> &mdash;
              a multi-asset trading intelligence platform offering market data, signal detection,
              risk tooling, and optional algorithmic trade routing through user-configured
              broker connections. For the purposes of UK GDPR, EU GDPR, and the California
              Consumer Privacy Act (CCPA / CPRA), we are the <strong>data controller</strong> for
              the personal information described in this policy. Contact us at{" "}
              <a href="mailto:privacy@tradewithvic.com" className="text-accent-light underline">privacy@tradewithvic.com</a>.
            </p>
          </section>

          {/* 2. What we collect ─────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Information we collect</h2>

            <h3 className="text-foreground font-semibold mt-4 mb-1">2.1 Information you give us directly</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account details</strong>: name, email address, and (if you sign up with email) a hashed password. We never store passwords in plain text.</li>
              <li><strong>Profile preferences</strong>: language, watchlist symbols, alert settings, notification channels, dashboard layout.</li>
              <li><strong>Trading account links</strong>: broker name, server name, MT4/MT5 account login, account label, base currency, leverage, and connection metadata. Sensitive credentials inside <code>adapterConfigJson</code> are encrypted at rest.</li>
              <li><strong>Trade orders</strong>: every order you submit through TradeWithVic &mdash; entry, stop loss, take profit, lot size, side, comment, and the broker response we receive back.</li>
              <li><strong>Algo configurations</strong>: per-bot strategy filters, risk caps, allowed sessions, account selections, and on/off state.</li>
              <li><strong>Community contributions</strong>: posts, reactions, and trade ideas you publish to the in-app community.</li>
              <li><strong>Billing details</strong>: name on file, billing address, currency, and payment-method metadata. Card numbers and full bank details are handled by <strong>Stripe</strong>; cryptocurrency payments by <strong>BitPay</strong>. We store only the references and last-four digits / network identifiers needed to display your account.</li>
              <li><strong>Support correspondence</strong>: messages you send via email, chat, or contact forms.</li>
            </ul>

            <h3 className="text-foreground font-semibold mt-4 mb-1">2.2 Information we collect automatically</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Device &amp; session data</strong>: IP address, user agent, approximate location (derived from IP), session timestamps, and pages visited.</li>
              <li><strong>Usage telemetry</strong>: which features you used, error logs, and timing data needed to keep the platform reliable.</li>
              <li><strong>Local storage values</strong>: a per-device user key (used to bind anonymous trade-execution data to your browser before sign-in), dismissed-alert flags, and dashboard view state. These live in your browser, not our database.</li>
            </ul>

            <h3 className="text-foreground font-semibold mt-4 mb-1">2.3 Information we generate about you</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Signal &amp; setup decisions</strong>: every setup our brain produces is logged with the input features, score components, and rules version (<code>SetupDecisionLog</code>) so we can audit and improve the engine.</li>
              <li><strong>Outcome &amp; performance data</strong>: per-trade SL/TP hits, MFE/MAE, R-multiple, exit reason, and per-strategy expectancy so the system can detect strategy decay and surface attribution.</li>
              <li><strong>Risk snapshots</strong>: per-currency exposure, drawdown state, and event-risk evaluations the runtime uses to decide whether to route a candidate trade.</li>
              <li><strong>Model predictions</strong>: shadow and live ranking outputs from the adaptive intelligence pipeline.</li>
            </ul>

            <h3 className="text-foreground font-semibold mt-4 mb-1">2.4 Information we do <em>not</em> collect</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>We do not collect or store your broker password directly &mdash; broker authentication happens inside your Expert Advisor or the marketplace adapter you authorize.</li>
              <li>We do not collect government identification, biometric data, or precise GPS location.</li>
              <li>We do not buy datasets that contain your personal information from third parties.</li>
            </ul>
          </section>

          {/* 3. How & why ───────────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. How and why we use information</h2>
            <p className="mb-3">
              We use the data above to operate the product, keep it secure, comply with legal obligations,
              and improve the engine. Specifically:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>To provide the service</strong>: render dashboards, compute signals, route trades you authorize, calculate position sizing, manage exposure, and surface alerts.</li>
              <li><strong>To process payments</strong>: charge subscriptions or one-off fees through Stripe / BitPay, issue receipts, manage refunds, and prevent fraud.</li>
              <li><strong>To secure the platform</strong>: detect abuse, enforce rate limits, investigate incidents, and maintain audit logs (every algo route, fill, and rejection).</li>
              <li><strong>To improve the engine</strong>: train and evaluate the adaptive intelligence pipeline. Outcome data is always tied to a setup decision so we can attribute wins and losses correctly. We use only your own data to personalise <em>your</em> experience &mdash; aggregate metrics may inform the broader platform, but never with personally identifying detail.</li>
              <li><strong>To communicate with you</strong>: send transactional notifications (deposits, withdrawals, alerts you subscribed to), security notices, and product updates. You can unsubscribe from non-essential emails at any time.</li>
              <li><strong>To meet legal obligations</strong>: tax, accounting, anti-fraud, and any regulatory request applicable to financial-adjacent platforms in jurisdictions we operate.</li>
            </ul>
            <p className="mt-3">
              <strong>We do not sell your personal data.</strong> We do not run advertising on the platform and do not share your data with ad networks.
            </p>
          </section>

          {/* 4. Legal bases ─────────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Legal bases for processing (UK / EU users)</h2>
            <p>If you are in the UK or EU, we rely on the following legal bases under UK GDPR / EU GDPR:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Contract</strong>: to provide the platform, route the trades you authorize, manage your subscription, and act on your support requests.</li>
              <li><strong>Legitimate interests</strong>: to keep the service secure, prevent fraud, debug errors, and improve our signal quality. We balance this against your rights and freedoms; you can object at any time.</li>
              <li><strong>Consent</strong>: for non-essential cookies, marketing emails, and any optional analytics features. You can withdraw consent at any time without affecting prior processing.</li>
              <li><strong>Legal obligation</strong>: to comply with tax, anti-money-laundering, and any sector-specific regulation applicable to us.</li>
            </ul>
          </section>

          {/* 5. Sharing & processors ───────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Who we share information with</h2>
            <p className="mb-3">
              We share information only with the processors listed below, under written contracts that
              limit them to providing services to us. Each link goes to that processor&rsquo;s own privacy notice.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-border/40 rounded-lg overflow-hidden">
                <thead className="bg-surface-2 text-foreground">
                  <tr>
                    <th className="text-left p-2 border-b border-border/40">Processor</th>
                    <th className="text-left p-2 border-b border-border/40">Role</th>
                    <th className="text-left p-2 border-b border-border/40">Region</th>
                  </tr>
                </thead>
                <tbody className="text-muted-light">
                  <tr className="border-b border-border/30"><td className="p-2"><a className="text-accent-light underline" href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer">Vercel</a></td><td className="p-2">Web hosting, edge network, function execution, deployment logs</td><td className="p-2">US (global edge)</td></tr>
                  <tr className="border-b border-border/30"><td className="p-2"><a className="text-accent-light underline" href="https://railway.app/legal/privacy" target="_blank" rel="noreferrer">Railway</a></td><td className="p-2">Postgres database hosting (primary data store)</td><td className="p-2">US</td></tr>
                  <tr className="border-b border-border/30"><td className="p-2"><a className="text-accent-light underline" href="https://stripe.com/privacy" target="_blank" rel="noreferrer">Stripe</a></td><td className="p-2">Card and bank-transfer payment processing, fraud screening, subscription billing</td><td className="p-2">US / EU</td></tr>
                  <tr className="border-b border-border/30"><td className="p-2"><a className="text-accent-light underline" href="https://bitpay.com/about/privacy" target="_blank" rel="noreferrer">BitPay</a></td><td className="p-2">Cryptocurrency payment processing</td><td className="p-2">US</td></tr>
                  <tr className="border-b border-border/30"><td className="p-2"><a className="text-accent-light underline" href="https://twelvedata.com/privacy" target="_blank" rel="noreferrer">TwelveData</a></td><td className="p-2">Real-time and historical market data (quotes, candles)</td><td className="p-2">US</td></tr>
                  <tr className="border-b border-border/30"><td className="p-2"><a className="text-accent-light underline" href="https://finnhub.io/privacy" target="_blank" rel="noreferrer">Finnhub</a></td><td className="p-2">Economic calendar and breaking-news feeds for the alert banner</td><td className="p-2">US</td></tr>
                  <tr className="border-b border-border/30"><td className="p-2"><a className="text-accent-light underline" href="https://www.tradingview.com/privacy-policy/" target="_blank" rel="noreferrer">TradingView</a></td><td className="p-2">Embedded chart widgets (loaded in your browser; we never proxy this data)</td><td className="p-2">US / UK</td></tr>
                  <tr><td className="p-2"><a className="text-accent-light underline" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noreferrer">Anthropic</a></td><td className="p-2">AI summarisation of news and signals (when used; payloads exclude personal data)</td><td className="p-2">US</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              We additionally share information when required by law, in response to valid legal process,
              or to protect our rights, property, or safety, or that of our users or the public.
            </p>
            <p className="mt-3">
              If we ever undergo a corporate event (merger, acquisition, asset sale, or bankruptcy), your
              data may transfer to the successor entity. We will notify you and update this policy if that
              happens.
            </p>
          </section>

          {/* 6. Broker access ───────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Broker connections and trade routing</h2>
            <p className="mb-2">
              TradeWithVic can route trades to your broker on your authorization through one of two paths:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>EA Bridge</strong>: an Expert Advisor running inside your own MT4/MT5 terminal polls our queue and executes trades using credentials that never leave your machine. We see only the trade tickets you authorize and the broker&rsquo;s response.</li>
              <li><strong>Marketplace adapters (e.g. MetaApi)</strong>: with your explicit authorization, we hold an encrypted broker token in our database to route orders programmatically. This token is segmented per account, encrypted at rest, and revocable by you at any time from the Trading Hub.</li>
            </ul>
            <p className="mt-3">
              Either path keeps your broker password out of our control plane. You can disconnect a linked
              account at any time, and we will retain only the historical trade audit trail required for
              accounting and dispute purposes.
            </p>
          </section>

          {/* 7. Automated decision-making ───────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Automated trade routing</h2>
            <p>
              When you enable an algo bot or accept the platform&rsquo;s smart-exit settings, you are
              authorizing TradeWithVic to make automated decisions on your behalf within the limits you
              configure (risk per trade, allowed strategies, maximum positions, daily loss cap, allowed
              sessions). These decisions are <strong>not</strong> based on any profiling of your personal
              characteristics &mdash; they are based on market conditions, the strategy specs you selected, and
              the risk caps you set. You can review every routed and rejected trade in your execution
              history, you can pause or disable any bot at any time, and you retain a kill-switch on the
              account itself. If you are in the UK or EU and want to contest an automated decision, contact{" "}
              <a href="mailto:privacy@tradewithvic.com" className="text-accent-light underline">privacy@tradewithvic.com</a>.
            </p>
          </section>

          {/* 8. Retention ───────────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">8. How long we keep data</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Account data</strong>: while your account is active, plus up to 90 days after closure for chargeback / dispute windows. Anonymised aggregates may be retained for product analytics.</li>
              <li><strong>Trade and execution audit logs</strong>: at least 7 years to satisfy financial-records best practice and any tax obligations applicable to us.</li>
              <li><strong>Payment records</strong>: 7 years (typical tax / VAT retention).</li>
              <li><strong>Support tickets</strong>: 3 years from last contact.</li>
              <li><strong>Server logs &amp; backups</strong>: rotating window, typically 30 days for application logs and up to 35 days for database point-in-time backups.</li>
              <li><strong>Marketing emails</strong>: until you unsubscribe.</li>
            </ul>
          </section>

          {/* 9. International transfers ───────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">9. International transfers</h2>
            <p>
              Our infrastructure runs primarily in the United States (Vercel, Railway). If you access the
              platform from the UK, EU, or another region, your data is transferred to the US. We rely on
              the European Commission&rsquo;s Standard Contractual Clauses (and the UK addendum where
              applicable) and supplementary safeguards required under the EU-US Data Privacy Framework
              decisions. You can request a copy of the relevant transfer mechanism by emailing us.
            </p>
          </section>

          {/* 10. Security ───────────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">10. Security</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>HTTPS everywhere. All traffic to and from tradewithvic.com is encrypted in transit.</li>
              <li>Passwords are hashed using a modern, salted algorithm; we never see your plaintext password.</li>
              <li>Broker tokens and other secrets are encrypted at rest.</li>
              <li>Database access is restricted, role-segmented, and audited.</li>
              <li>Sensitive operations (admin actions, kill-switch, account deletion) are logged.</li>
              <li>We run automated build-time type and security checks before every deploy.</li>
              <li>No system is unbreakable. If we discover a breach affecting your data, we will notify you and the relevant authority within the timelines required by applicable law.</li>
            </ul>
          </section>

          {/* 11. Cookies & local storage ──────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">11. Cookies and local storage</h2>
            <p>We use a small number of cookies and browser storage entries:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Session cookie</strong>: keeps you signed in. Required for the platform to work; you cannot disable it without breaking authentication.</li>
              <li><strong>Per-device user key (localStorage)</strong>: anonymously links pre-sign-in trade executions to your account when you sign up.</li>
              <li><strong>UI preference cookies / localStorage</strong>: theme, dismissed alerts, dashboard view choice. Convenience only; you can clear them at any time.</li>
              <li><strong>Analytics</strong>: when enabled, only first-party metrics counting page views and timing are stored. We do not run third-party advertising tags or fingerprinting.</li>
            </ul>
          </section>

          {/* 12. Your rights ─────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">12. Your rights</h2>
            <p className="mb-2">Subject to local law, you can:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Access</strong> the personal information we hold about you.</li>
              <li><strong>Correct</strong> data that is inaccurate or incomplete.</li>
              <li><strong>Delete</strong> your account and associated personal data (subject to legal retention obligations on records like trade audit trails).</li>
              <li><strong>Export</strong> your data in a portable machine-readable format.</li>
              <li><strong>Restrict</strong> or <strong>object</strong> to certain processing activities, including profiling for product improvement.</li>
              <li><strong>Withdraw consent</strong> for processing that relies on consent (e.g. marketing emails) at any time.</li>
              <li><strong>Lodge a complaint</strong> with a supervisory authority &mdash; the UK ICO if you are in the UK, your national DPA in the EU, or your state Attorney General in the US. We&rsquo;d appreciate the chance to address your concern first.</li>
            </ul>
            <p className="mt-3">
              <strong>California residents (CCPA / CPRA)</strong>: in addition to the rights above, you have
              the right to know what categories of personal information we have collected about you in the
              past 12 months, the right to opt out of any &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of your personal information
              (we don&rsquo;t do either), and the right not to be discriminated against for exercising any of
              these rights. Contact{" "}
              <a href="mailto:privacy@tradewithvic.com" className="text-accent-light underline">privacy@tradewithvic.com</a>{" "}
              and we will respond within 45 days.
            </p>
          </section>

          {/* 13. Children ───────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">13. Children</h2>
            <p>
              TradeWithVic is not directed at, and we do not knowingly collect personal information from,
              anyone under 18 years of age. If you believe a minor has created an account, contact us and
              we will delete it.
            </p>
          </section>

          {/* 14. Risk disclosure ───────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">14. Risk disclosure</h2>
            <p>
              Trading leveraged products is high risk and can result in losses that exceed your deposits.
              Nothing in TradeWithVic is investment advice, and historical performance attribution shown in
              the platform is not a guarantee of future results. The data we generate about your trading
              (signals, scores, smart-exit suggestions) is decision-support output produced by software,
              not a recommendation tailored to your individual circumstances. You remain solely responsible
              for the trades you authorize, including those routed by automated bots you enable.
            </p>
          </section>

          {/* 15. Changes ───────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">15. Changes to this policy</h2>
            <p>
              When we make material changes (for example, adding a new processor or changing how we
              process data), we will update the &ldquo;Effective&rdquo; date at the top of this page and notify you
              by email or in-app banner before the change takes effect. Continued use of the platform after
              a change indicates acceptance of the updated policy.
            </p>
          </section>

          {/* 16. Contact ───────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">16. Contact</h2>
            <p>
              For privacy questions, requests under your rights above, or to report a security concern,
              email <a href="mailto:privacy@tradewithvic.com" className="text-accent-light underline">privacy@tradewithvic.com</a>.
              For general support, email{" "}
              <a href="mailto:support@tradewithvic.com" className="text-accent-light underline">support@tradewithvic.com</a>.
              We aim to respond within 7 days, and within the legal timelines (typically 30 days under
              GDPR / 45 days under CCPA) where applicable.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
