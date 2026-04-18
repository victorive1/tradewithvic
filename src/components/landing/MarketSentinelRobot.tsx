"use client";

import { useMemo, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Quote {
  symbol: string;
  displayName: string;
  price: number;
  changePercent: number;
}

interface Props {
  quotes: Quote[];
  className?: string;
}

type Mood = "bullish" | "bearish" | "neutral";

function classifyMood(quotes: Quote[]): Mood {
  if (quotes.length === 0) return "neutral";
  const net = quotes.reduce((s, q) => s + (q.changePercent || 0), 0) / quotes.length;
  if (net > 0.1) return "bullish";
  if (net < -0.1) return "bearish";
  return "neutral";
}

const MOOD_TINTS: Record<Mood, { primary: string; soft: string; glow: string; label: string }> = {
  bullish: { primary: "#10b981", soft: "#34d399", glow: "rgba(16,185,129,0.35)", label: "RISK ON" },
  bearish: { primary: "#f43f5e", soft: "#fb7185", glow: "rgba(244,63,94,0.35)", label: "RISK OFF" },
  neutral: { primary: "#6366f1", soft: "#818cf8", glow: "rgba(99,102,241,0.35)", label: "SCANNING" },
};

export function MarketSentinelRobot({ quotes, className }: Props) {
  const mood = useMemo(() => classifyMood(quotes), [quotes]);
  const tint = MOOD_TINTS[mood];

  const topMover = useMemo(() => {
    if (quotes.length === 0) return null;
    return [...quotes].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];
  }, [quotes]);

  // Ticker rotation — cycle through the most active symbols
  const [tickerIndex, setTickerIndex] = useState(0);
  useEffect(() => {
    if (quotes.length === 0) return;
    const iv = setInterval(() => setTickerIndex((i) => (i + 1) % Math.max(1, quotes.length)), 2800);
    return () => clearInterval(iv);
  }, [quotes.length]);

  const displayQuote = quotes.length > 0 ? quotes[tickerIndex % quotes.length] : null;

  // Map market heat to arm angles — stronger move = more raised/lowered.
  const heat = useMemo(() => {
    if (quotes.length === 0) return 0;
    return Math.min(1, Math.max(-1,
      quotes.reduce((s, q) => s + (q.changePercent || 0), 0) / Math.max(1, quotes.length) / 1.5
    ));
  }, [quotes]);

  const armAngle = heat * 45; // -45 (bearish, arms down further) to +45 (bullish, arms up)

  return (
    <div className={"relative w-full h-full flex items-center justify-center " + (className ?? "")}>
      {/* Ambient glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full blur-3xl" style={{ background: tint.glow }} />
        <div className="absolute bottom-1/4 right-1/4 w-56 h-56 rounded-full blur-3xl" style={{ background: tint.glow }} />
      </motion.div>

      {/* Data particles drifting across */}
      <DataParticles tint={tint.soft} />

      {/* Radar sweep under the robot */}
      <svg
        className="absolute"
        style={{ top: "62%", left: "50%", transform: "translate(-50%, 0)", width: 340, height: 340 }}
        viewBox="0 0 340 340"
        aria-hidden
      >
        <defs>
          <radialGradient id="radar-grad" cx="50%" cy="50%">
            <stop offset="0%" stopColor={tint.primary} stopOpacity="0.35" />
            <stop offset="70%" stopColor={tint.primary} stopOpacity="0.02" />
            <stop offset="100%" stopColor={tint.primary} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sweep-grad" x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor={tint.primary} stopOpacity="0" />
            <stop offset="100%" stopColor={tint.primary} stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <ellipse cx="170" cy="170" rx="150" ry="30" fill="url(#radar-grad)" />
        <g>
          <motion.g
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "170px 170px" }}
          >
            <path d="M170 170 L320 155 A150 30 0 0 0 170 140 Z" fill="url(#sweep-grad)" />
          </motion.g>
        </g>
      </svg>

      {/* Robot body — hovers */}
      <motion.div
        className="relative z-10"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ width: 280, height: 420 }}
      >
        <svg viewBox="0 0 280 420" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="body-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a1b2e" />
              <stop offset="100%" stopColor="#0a0b14" />
            </linearGradient>
            <linearGradient id="chrome-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3a3d55" />
              <stop offset="50%" stopColor="#5c6079" />
              <stop offset="100%" stopColor="#2a2b3d" />
            </linearGradient>
            <radialGradient id="visor-grad" cx="50%" cy="40%">
              <stop offset="0%" stopColor={tint.soft} stopOpacity="0.95" />
              <stop offset="60%" stopColor={tint.primary} stopOpacity="0.8" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.85" />
            </radialGradient>
            <linearGradient id="screen-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050611" />
              <stop offset="100%" stopColor="#0f1326" />
            </linearGradient>
            <filter id="neon-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Antenna */}
          <motion.g
            animate={{ rotate: [-6, 6, -6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "140px 70px" }}
          >
            <line x1="140" y1="70" x2="140" y2="20" stroke="url(#chrome-grad)" strokeWidth="3" />
            <motion.circle
              cx="140" cy="18" r="8"
              fill={tint.soft}
              filter="url(#neon-glow)"
              animate={{ r: [7, 10, 7] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle cx="140" cy="18" r="14" fill="none" stroke={tint.soft} strokeWidth="1"
              animate={{ opacity: [0.4, 0, 0.4], r: [14, 24, 14] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          </motion.g>

          {/* Head */}
          <rect x="90" y="70" width="100" height="90" rx="20" fill="url(#body-grad)" stroke="url(#chrome-grad)" strokeWidth="2" />

          {/* Visor (eyes) */}
          <rect x="100" y="88" width="80" height="32" rx="14" fill="url(#visor-grad)" filter="url(#neon-glow)" />

          {/* Scanning pupils */}
          <motion.g
            animate={{ x: [-6, 6, -6] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <circle cx="122" cy="104" r="3.5" fill="#fff" />
            <circle cx="158" cy="104" r="3.5" fill="#fff" />
          </motion.g>

          {/* Mouth bar */}
          <rect x="114" y="130" width="52" height="5" rx="2" fill={tint.primary} opacity="0.8" />

          {/* Neck */}
          <rect x="125" y="160" width="30" height="14" rx="4" fill="url(#chrome-grad)" />

          {/* Body / chest */}
          <rect x="70" y="174" width="140" height="160" rx="20" fill="url(#body-grad)" stroke="url(#chrome-grad)" strokeWidth="2" />

          {/* Chest LCD screen */}
          <rect x="90" y="195" width="100" height="70" rx="8" fill="url(#screen-grad)" stroke={tint.primary} strokeOpacity="0.45" strokeWidth="1.5" />
          <rect x="95" y="200" width="90" height="3" rx="1.5" fill={tint.soft} opacity="0.4" />
          <rect x="95" y="255" width="90" height="3" rx="1.5" fill={tint.soft} opacity="0.4" />

          {/* Live ticker on chest */}
          <foreignObject x="94" y="207" width="92" height="44">
            <AnimatePresence mode="wait">
              {displayQuote ? (
                <motion.div
                  key={displayQuote.symbol}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center justify-center h-full text-center"
                  style={{ fontFamily: "ui-monospace, monospace" }}
                >
                  <div style={{ color: tint.soft, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85 }}>
                    {displayQuote.displayName}
                  </div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    {displayQuote.price.toFixed(displayQuote.price > 1000 ? 0 : displayQuote.price > 10 ? 2 : 4)}
                  </div>
                  <div style={{
                    color: displayQuote.changePercent >= 0 ? "#34d399" : "#fb7185",
                    fontSize: 10,
                    fontWeight: 600,
                    marginTop: 1,
                  }}>
                    {displayQuote.changePercent >= 0 ? "▲" : "▼"} {displayQuote.changePercent >= 0 ? "+" : ""}{displayQuote.changePercent.toFixed(2)}%
                  </div>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center" style={{ fontFamily: "ui-monospace, monospace" }}>
                  <div style={{ color: tint.soft, fontSize: 10, letterSpacing: 2 }}>SCANNING</div>
                </div>
              )}
            </AnimatePresence>
          </foreignObject>

          {/* Heart core beneath screen */}
          <motion.circle
            cx="140" cy="290" r="12"
            fill={tint.primary}
            filter="url(#neon-glow)"
            animate={{ r: [11, 14, 11], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
          <circle cx="140" cy="290" r="6" fill="#fff" fillOpacity="0.25" />

          {/* Status indicator row */}
          <g>
            {[0, 1, 2, 3].map((i) => (
              <motion.circle
                key={i}
                cx={104 + i * 24} cy={318} r="3"
                fill={tint.soft}
                animate={{ opacity: [0.25, 1, 0.25] }}
                transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
              />
            ))}
          </g>

          {/* Left arm */}
          <motion.g
            style={{ transformOrigin: "70px 195px" }}
            animate={{ rotate: -armAngle }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
          >
            <rect x="40" y="190" width="30" height="90" rx="14" fill="url(#chrome-grad)" />
            <circle cx="55" cy="285" r="14" fill="url(#chrome-grad)" stroke="#1a1b2e" strokeWidth="2" />
            <motion.circle cx="55" cy="285" r="5" fill={tint.soft}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          </motion.g>

          {/* Right arm */}
          <motion.g
            style={{ transformOrigin: "210px 195px" }}
            animate={{ rotate: armAngle }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
          >
            <rect x="210" y="190" width="30" height="90" rx="14" fill="url(#chrome-grad)" />
            <circle cx="225" cy="285" r="14" fill="url(#chrome-grad)" stroke="#1a1b2e" strokeWidth="2" />
            <motion.circle cx="225" cy="285" r="5" fill={tint.soft}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, delay: 0.5, repeat: Infinity }}
            />
          </motion.g>

          {/* Legs/base */}
          <rect x="110" y="334" width="60" height="30" rx="10" fill="url(#body-grad)" stroke="url(#chrome-grad)" strokeWidth="2" />
          <ellipse cx="140" cy="378" rx="55" ry="10" fill="#000" opacity="0.55" />

          {/* Under-thrusters */}
          <motion.ellipse
            cx="125" cy="367" rx="6" ry="3" fill={tint.soft}
            animate={{ opacity: [0.4, 1, 0.4], ry: [3, 5, 3] }}
            transition={{ duration: 0.9, repeat: Infinity }}
          />
          <motion.ellipse
            cx="155" cy="367" rx="6" ry="3" fill={tint.soft}
            animate={{ opacity: [0.4, 1, 0.4], ry: [3, 5, 3] }}
            transition={{ duration: 0.9, delay: 0.3, repeat: Infinity }}
          />
        </svg>
      </motion.div>

      {/* Mood pill */}
      <motion.div
        key={mood}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm"
        style={{ background: "rgba(0,0,0,0.35)", borderColor: tint.primary, color: tint.soft }}
      >
        <motion.span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: tint.primary }}
          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase">{tint.label}</span>
        <span className="text-[10px] opacity-70 font-mono">{quotes.length} markets</span>
      </motion.div>

      {/* Top mover banner at the bottom */}
      {topMover && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          <span className="text-[10px] font-bold text-white/70 tracking-wider uppercase">Top Mover</span>
          <span className="text-xs font-mono font-semibold text-white">{topMover.displayName}</span>
          <span
            className="text-xs font-mono font-bold"
            style={{ color: topMover.changePercent >= 0 ? "#34d399" : "#fb7185" }}
          >
            {topMover.changePercent >= 0 ? "+" : ""}{topMover.changePercent.toFixed(2)}%
          </span>
        </motion.div>
      )}
    </div>
  );
}

function DataParticles({ tint }: { tint: string }) {
  const particles = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 3,
      duration: 5 + Math.random() * 6,
      delay: Math.random() * 4,
    }));
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, background: tint, opacity: 0.6 }}
          animate={{
            y: [0, -30, 0],
            opacity: [0, 0.7, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
