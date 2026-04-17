"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "connect" | "account" | "execute" | "positions" | "orders" | "history";

const brokerServers: Record<string, string[]> = {
  "ICMarkets": ["ICMarkets-Demo", "ICMarkets-Demo02", "ICMarkets-Demo03", "ICMarkets-Live01", "ICMarkets-Live02", "ICMarkets-Live03", "ICMarkets-Live04", "ICMarkets-Live05", "ICMarkets-Live06", "ICMarkets-Live07", "ICMarkets-Live08", "ICMarkets-Live09", "ICMarkets-Live10", "ICMarkets-Live11", "ICMarkets-Live12", "ICMarkets-Live14", "ICMarkets-Live15", "ICMarkets-Live17", "ICMarkets-Live19", "ICMarkets-Live20", "ICMarkets-Live22", "ICMarkets-Live23", "ICMarketsEU-Demo", "ICMarketsEU-Live01", "ICMarketsEU-Live02", "ICMarketsEU-Live03", "ICMarketsEU-Live04", "ICMarketsSC-Demo", "ICMarketsSC-Live01", "ICMarketsSC-Live02", "ICMarketsSC-Live03", "ICMarketsSC-Live04", "ICMarketsSC-Live05", "ICMarketsSC-Live06", "ICMarketsSC-Live07", "ICMarketsSC-Live08", "ICMarketsSC-Live09"],
  "Pepperstone": ["Pepperstone-Demo", "Pepperstone-Demo02", "Pepperstone-Live01", "Pepperstone-Live02", "Pepperstone-Live03", "Pepperstone-Live04", "Pepperstone-Edge01", "Pepperstone-Edge02", "Pepperstone-Edge03", "Pepperstone-Edge04", "Pepperstone-Edge05", "PepperstoneUK-Demo", "PepperstoneUK-Live01", "PepperstoneUK-Live02"],
  "XM": ["XMGlobal-Real 1", "XMGlobal-Real 2", "XMGlobal-Real 3", "XMGlobal-Real 4", "XMGlobal-Real 5", "XMGlobal-Real 8", "XMGlobal-Real 9", "XMGlobal-Real 10", "XMGlobal-Demo 1", "XMGlobal-Demo 3", "XMGlobal-MT5", "XMGlobal-MT5-2", "XMGlobal-MT5-Demo"],
  "Exness": ["Exness-Real", "Exness-Real2", "Exness-Real3", "Exness-Real4", "Exness-Real5", "Exness-Real6", "Exness-Real7", "Exness-Real8", "Exness-Real9", "Exness-Trial", "Exness-Trial2", "Exness-Trial3", "Exness-Trial4", "Exness-MT5Real", "Exness-MT5Real2", "Exness-MT5Real3", "Exness-MT5Trial"],
  "FTMO": ["FTMO-Demo", "FTMO-Demo2", "FTMO-Server", "FTMO-Server2", "FTMO-Server3", "FTMO-Live"],
  "Deriv": ["Deriv-Demo", "Deriv-Server", "Deriv-Server02", "Deriv-Server03"],
  "FBS": ["FBS-Demo", "FBS-Real-1", "FBS-Real-2", "FBS-Real-3", "FBS-Real-4", "FBS-Real-5", "FBS-MT5"],
  "FXTM": ["ForexTimeFXTM-Demo01", "ForexTimeFXTM-Live01", "ForexTimeFXTM-Live02", "ForexTimeFXTM-Live03", "ForexTimeFXTM-ECN-Demo", "ForexTimeFXTM-ECN-Live"],
  "RoboForex": ["RoboForex-Demo", "RoboForex-ECN", "RoboForex-Pro", "RoboForex-Prime", "RoboForex-MT5Demo", "RoboForex-MT5ECN"],
  "OctaFX": ["OctaFX-Demo", "OctaFX-Real", "OctaFX-Real2", "OctaFX-Real3", "OctaFX-MT5-Demo", "OctaFX-MT5-Real"],
  "Tickmill": ["Tickmill-Demo", "Tickmill-Live", "Tickmill-Live02", "Tickmill-Live03", "TickmillEU-Demo", "TickmillEU-Live"],
  "FP Markets": ["FPMarkets-Demo", "FPMarkets-Live", "FPMarkets-Live2", "FPMarkets-Live3"],
  "Vantage": ["VantageFX-Demo", "VantageFX-Live", "VantageFX-Live2", "VantageFX-Live3", "VantageInternational-Demo", "VantageInternational-Live"],
  "Admirals": ["Admirals-Demo", "AdmiralsGroup-Demo", "Admirals-Live", "Admirals-Live2", "AdmiralsGroup-Live"],
  "AvaTrade": ["AvaTrade-Demo", "AvaTrade-Real", "AvaTrade-Real2", "Ava-Real 1", "Ava-Real 2"],
  "HFM (HotForex)": ["HFMarketsGlobal-Demo", "HFMarketsGlobal-Live Server", "HFMarketsGlobal-Live Server 2", "HFMarketsGlobal-Live Server 3"],
  "OANDA": ["OANDA-v20 Practice", "OANDA-v20 Live", "OANDA-Japan Practice", "OANDA-Japan Live"],
  "ThinkMarkets": ["ThinkMarkets-Demo", "ThinkMarkets-Live", "ThinkMarketsAU-Demo", "ThinkMarketsAU-Live"],
  "Axi": ["AxiTrader-Demo", "AxiTrader-Live", "AxiTrader-Live-2", "AxiTrader-Live-3", "AxiTrader-US-Demo"],
  "FXCM": ["FXCM-USDDemo01", "FXCM-USDReal01", "FXCM-USDReal02", "FXCM-MT5Demo", "FXCM-MT5Real"],
  "Eightcap": ["Eightcap-Demo", "Eightcap-Live", "Eightcap-Live2"],
  "BlackBull": ["BlackBullMarkets-Demo", "BlackBullMarkets-Live", "BlackBullMarkets-Live 2"],
  "FundedNext": ["FundedNext-Demo", "FundedNext-Server", "FundedNext-Server2"],
  "MyForexFunds": ["MFF-Demo", "MFF-Server", "MFF-Server2"],
  "The5ers": ["The5ers-Demo", "The5ers-Server"],
  "TopStep": ["TopStep-Demo", "TopStep-Live"],
  "E8 Funding": ["E8-Demo", "E8-Server", "E8-Server2"],
  "TradingView (Paper)": ["PaperTrading"],
};

// Flatten all servers into a searchable list
const allServers = Object.entries(brokerServers).flatMap(([broker, servers]) =>
  servers.map((server) => ({ broker, server }))
);

function ConnectTab() {
  const [platform, setPlatform] = useState<"MT4" | "MT5">("MT5");
  const [brokerSearch, setBrokerSearch] = useState("");
  const [selectedServer, setSelectedServer] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredServers = brokerSearch.length > 0
    ? allServers.filter((s) =>
        s.server.toLowerCase().includes(brokerSearch.toLowerCase()) ||
        s.broker.toLowerCase().includes(brokerSearch.toLowerCase())
      ).slice(0, 30)
    : allServers.slice(0, 30);

  // Group filtered results by broker
  const grouped: Record<string, string[]> = {};
  filteredServers.forEach((s) => {
    if (!grouped[s.broker]) grouped[s.broker] = [];
    grouped[s.broker].push(s.server);
  });

  function selectServer(server: string) {
    setSelectedServer(server);
    setBrokerSearch(server);
    setShowDropdown(false);
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <h3 className="text-lg font-semibold text-foreground">Connect MetaTrader Account</h3>
      <div className="flex gap-2">
        {(["MT4", "MT5"] as const).map((p) => (
          <button key={p} onClick={() => setPlatform(p)}
            className={cn("flex-1 py-3 rounded-xl text-sm font-medium transition-smooth",
              platform === p ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{p}</button>
        ))}
      </div>
      <div><label className="text-xs text-muted-light mb-1.5 block">Account Login</label>
        <input type="text" placeholder="e.g. 5042885676" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
      <div><label className="text-xs text-muted-light mb-1.5 block">Password</label>
        <input type="password" placeholder="Account password" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>

      {/* Broker Server Searchable Dropdown */}
      <div className="relative">
        <label className="text-xs text-muted-light mb-1.5 block">Broker Server</label>
        <input
          type="text"
          value={brokerSearch}
          onChange={(e) => { setBrokerSearch(e.target.value); setShowDropdown(true); setSelectedServer(""); }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search broker or server..."
          className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
        />
        {/* Dropdown icon */}
        <button onClick={() => setShowDropdown(!showDropdown)} className="absolute right-3 top-[34px] text-muted hover:text-muted-light">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>

        {showDropdown && (
          <div className="absolute z-50 w-full mt-1 bg-surface border border-border rounded-xl shadow-2xl shadow-black/30 max-h-72 overflow-y-auto">
            {Object.keys(grouped).length === 0 ? (
              <div className="px-4 py-3 text-xs text-muted">No servers found for &ldquo;{brokerSearch}&rdquo;</div>
            ) : (
              Object.entries(grouped).map(([broker, servers]) => (
                <div key={broker}>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-accent-light font-bold bg-surface-2/50 sticky top-0">{broker}</div>
                  {servers.map((server) => (
                    <button
                      key={server}
                      onClick={() => selectServer(server)}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm hover:bg-accent/10 transition-smooth flex items-center justify-between",
                        selectedServer === server ? "bg-accent/10 text-accent-light" : "text-foreground"
                      )}
                    >
                      <span>{server}</span>
                      {server.toLowerCase().includes("demo") && (
                        <span className="text-[9px] bg-bull/10 text-bull-light px-1.5 py-0.5 rounded">Demo</span>
                      )}
                      {server.toLowerCase().includes("live") && !server.toLowerCase().includes("demo") && (
                        <span className="text-[9px] bg-accent/10 text-accent-light px-1.5 py-0.5 rounded">Live</span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {selectedServer && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">Selected:</span>
          <span className="text-foreground font-medium bg-surface-2 px-2.5 py-1 rounded-lg">{selectedServer}</span>
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" defaultChecked className="w-4 h-4 accent-accent" /><span className="text-xs text-muted-light">Save to my profile</span></label>
      <div className="flex gap-3">
        <button className="flex-1 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm font-medium transition-smooth hover:border-accent">Test Connection</button>
        <button className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent">Connect</button>
      </div>
    </div>
  );
}

function AccountTab({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="glass-card p-12 text-center space-y-4">
      <div className="text-4xl mb-2">&#128274;</div>
      <h3 className="text-lg font-semibold text-foreground">No account connected</h3>
      <p className="text-sm text-muted max-w-md mx-auto">
        Connect your MT4/MT5 account to see live balance, equity, and positions.
      </p>
      <button
        onClick={onConnect}
        className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent"
      >
        Connect Account
      </button>
    </div>
  );
}

function PositionsTab() {
  return (
    <div className="glass-card p-12 text-center space-y-3">
      <div className="text-4xl mb-2">&#128202;</div>
      <h3 className="text-base font-semibold text-foreground">No open positions</h3>
      <p className="text-sm text-muted max-w-md mx-auto">
        Connect a trading account and execute trades to see live positions here.
      </p>
    </div>
  );
}

function HistoryTab() {
  return (
    <div className="glass-card p-12 text-center space-y-3">
      <div className="text-4xl mb-2">&#128203;</div>
      <h3 className="text-base font-semibold text-foreground">No trade history yet</h3>
      <p className="text-sm text-muted max-w-md mx-auto">
        Your executed trades will appear here once you start trading.
      </p>
    </div>
  );
}

export default function TradingHubPage() {
  const [tab, setTab] = useState<Tab>("account");
  const tabs: { id: Tab; label: string }[] = [
    { id: "connect", label: "Connect" },
    { id: "account", label: "Account" },
    { id: "execute", label: "Manual Trade" },
    { id: "positions", label: "Positions" },
    { id: "orders", label: "Orders" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Trading Hub</h1>
        </div>
        <p className="text-sm text-muted mt-1">Connect your MetaTrader account and execute trades directly from TradeWithVic App</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
              tab === t.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "connect" && <ConnectTab />}
      {tab === "account" && <AccountTab onConnect={() => setTab("connect")} />}
      {tab === "execute" && (
        <div className="max-w-lg mx-auto glass-card p-6 space-y-4">
          <h3 className="text-lg font-semibold">Place Manual Trade</h3>
          <div><label className="text-xs text-muted-light mb-1.5 block">Symbol</label>
            <select className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border text-sm text-foreground">
              <option>XAU/USD</option><option>EUR/USD</option><option>GBP/USD</option><option>NAS100</option><option>BTC/USD</option>
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <button className="py-3 rounded-xl bg-bull/20 text-bull-light border border-bull/30 text-sm font-bold hover:bg-bull/30 transition-smooth">BUY</button>
            <button className="py-3 rounded-xl bg-bear/20 text-bear-light border border-bear/30 text-sm font-bold hover:bg-bear/30 transition-smooth">SELL</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-light mb-1.5 block">Lot Size</label>
              <input type="number" step="0.01" defaultValue="0.10" className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
            <div><label className="text-xs text-bear-light mb-1.5 block">Stop Loss</label>
              <input type="number" step="0.01" className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-bear/20 focus:border-bear focus:outline-none text-sm text-foreground font-mono" /></div>
            <div><label className="text-xs text-bull-light mb-1.5 block">Take Profit</label>
              <input type="number" step="0.01" className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-bull/20 focus:border-bull focus:outline-none text-sm text-foreground font-mono" /></div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted">Est. Risk</span><span className="text-bear-light">$100.00</span></div>
            <div className="flex justify-between"><span className="text-muted">Margin Required</span><span className="text-foreground">$523.80</span></div>
          </div>
          <button className="w-full py-3.5 rounded-xl bg-accent text-white font-semibold text-sm transition-smooth glow-accent">Place Trade</button>
        </div>
      )}
      {tab === "positions" && <PositionsTab />}
      {tab === "orders" && <div className="glass-card p-12 text-center"><p className="text-muted">No pending orders</p></div>}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}
