import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

const posts = [
  { title: "How Multi-Timeframe Analysis Improves Your Win Rate", excerpt: "Learn how aligning your analysis across 15m, 1h, 4h, and daily timeframes can dramatically improve trade quality and confidence.", date: "Apr 15, 2026", category: "Strategy", slug: "#" },
  { title: "Understanding Market Structure: BOS vs MSS", excerpt: "Break of Structure and Market Structure Shifts are two of the most important concepts in price action trading. Here's how they differ.", date: "Apr 10, 2026", category: "Education", slug: "#" },
  { title: "Currency Strength: The Edge Most Traders Ignore", excerpt: "Why trading the strongest currency against the weakest gives you a statistical edge, and how TradeWithVic calculates real-time strength.", date: "Apr 5, 2026", category: "Intelligence", slug: "#" },
  { title: "Building Your First Algo Bot on TradeWithVic", excerpt: "A step-by-step guide to configuring and deploying your first automated trading bot using our Custom Bot Builder.", date: "Mar 28, 2026", category: "Algo Trading", slug: "#" },
  { title: "Risk Management Rules That Actually Work", excerpt: "The difference between profitable and unprofitable traders almost always comes down to risk management. Here are the rules that matter.", date: "Mar 20, 2026", category: "Risk", slug: "#" },
  { title: "How to Read the Liquidity Map", excerpt: "Liquidity sweeps, stop hunts, and order blocks — understanding where the money sits before it moves.", date: "Mar 12, 2026", category: "Intelligence", slug: "#" },
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
        <h1 className="text-4xl font-bold mb-2">Blog</h1>
        <p className="text-muted-light mb-10">Trading insights, platform updates, and educational content.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {posts.map((post, idx) => (
            <article key={idx} className="bg-surface rounded-xl border border-border/50 p-6 hover:border-border-light transition-smooth group">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent/10 text-accent-light">{post.category}</span>
                <span className="text-xs text-muted">{post.date}</span>
              </div>
              <h2 className="text-lg font-semibold mb-2 group-hover:text-accent-light transition-smooth">{post.title}</h2>
              <p className="text-sm text-muted-light leading-relaxed">{post.excerpt}</p>
              <p className="text-sm text-accent-light mt-4 font-medium">Read more &rarr;</p>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
