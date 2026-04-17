"use client";

import { useEffect, useRef, memo } from "react";

interface TradingViewWidgetProps {
  symbol: string;
  interval?: string;
  theme?: "dark" | "light";
  height?: number;
  autosize?: boolean;
}

function TradingViewWidgetInner({ symbol, interval = "60", theme = "dark", height = 500, autosize = true }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoaded = useRef(false);

  // Map internal symbols to TradingView format
  function toTVSymbol(sym: string): string {
    const map: Record<string, string> = {
      EURUSD: "FX:EURUSD",
      GBPUSD: "FX:GBPUSD",
      USDJPY: "FX:USDJPY",
      USDCHF: "FX:USDCHF",
      AUDUSD: "FX:AUDUSD",
      NZDUSD: "FX:NZDUSD",
      USDCAD: "FX:USDCAD",
      EURJPY: "FX:EURJPY",
      GBPJPY: "FX:GBPJPY",
      EURGBP: "FX:EURGBP",
      AUDJPY: "FX:AUDJPY",
      XAUUSD: "OANDA:XAUUSD",
      XAGUSD: "OANDA:XAGUSD",
      BTCUSD: "COINBASE:BTCUSD",
      ETHUSD: "COINBASE:ETHUSD",
      SOLUSD: "COINBASE:SOLUSD",
      XRPUSD: "COINBASE:XRPUSD",
      NAS100: "PEPPERSTONE:NAS100",
      US30: "PEPPERSTONE:US30",
      SPX500: "PEPPERSTONE:SPX500",
      GER40: "PEPPERSTONE:GER40",
      USOIL: "TVC:USOIL",
    };
    return map[sym] || `FX:${sym}`;
  }

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget
    containerRef.current.innerHTML = "";
    scriptLoaded.current = false;

    const tvSymbol = toTVSymbol(symbol);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: autosize,
      height: autosize ? "100%" : height,
      symbol: tvSymbol,
      interval: interval,
      timezone: "Etc/UTC",
      theme: theme,
      style: "1",
      locale: "en",
      backgroundColor: theme === "dark" ? "rgba(10, 11, 20, 1)" : "rgba(248, 249, 252, 1)",
      gridColor: theme === "dark" ? "rgba(42, 43, 61, 0.3)" : "rgba(212, 215, 224, 0.3)",
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
      allow_symbol_change: true,
      studies: [
        "STD;EMA",
        "STD;ATR",
      ],
      show_popup_button: true,
      popup_width: "1000",
      popup_height: "650",
    });

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container__widget";
    widgetContainer.style.height = autosize ? "100%" : `${height}px`;
    widgetContainer.style.width = "100%";

    containerRef.current.appendChild(widgetContainer);
    containerRef.current.appendChild(script);
    scriptLoaded.current = true;

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [symbol, interval, theme, height, autosize]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ height: autosize ? "100%" : `${height}px`, width: "100%" }}
    />
  );
}

export const TradingViewWidget = memo(TradingViewWidgetInner);
