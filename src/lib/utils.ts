import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, decimals: number = 2): string {
  return price.toFixed(decimals);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function getDirectionColor(direction: string): string {
  if (direction === "bullish" || direction === "buy") return "text-emerald-400";
  if (direction === "bearish" || direction === "sell") return "text-rose-400";
  return "text-zinc-400";
}

export function getDirectionBg(direction: string): string {
  if (direction === "bullish" || direction === "buy") return "bg-emerald-500/10 border-emerald-500/20";
  if (direction === "bearish" || direction === "sell") return "bg-rose-500/10 border-rose-500/20";
  return "bg-zinc-500/10 border-zinc-500/20";
}

export function getConfidenceColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-zinc-400";
}

export function getGradeColor(grade: string): string {
  if (grade === "A+" || grade === "A") return "text-emerald-400";
  if (grade === "B+" || grade === "B") return "text-amber-400";
  return "text-zinc-500";
}
