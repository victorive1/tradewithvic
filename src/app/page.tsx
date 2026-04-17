import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { MarketStrip } from "@/components/landing/MarketStrip";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { DashboardPreview } from "@/components/landing/DashboardPreview";
import { MarketsSection } from "@/components/landing/MarketsSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhyDifferent } from "@/components/landing/WhyDifferent";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <MarketStrip />
      <FeaturesSection />
      <DashboardPreview />
      <MarketsSection />
      <HowItWorks />
      <WhyDifferent />
      <CTASection />
      <Footer />
    </div>
  );
}
