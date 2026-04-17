"use client";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
  };

  return (
    <div className={`font-bold ${sizes[size]} tracking-tight flex items-center gap-2`}>
      <div className="relative">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-white text-sm font-black">
          FX
        </div>
        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-bull animate-pulse" />
      </div>
      <span className="text-foreground">
        FX <span className="gradient-text-accent">Wonders</span>
      </span>
    </div>
  );
}
