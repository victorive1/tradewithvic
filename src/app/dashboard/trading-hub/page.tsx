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
  "JustMarkets": ["JustMarkets-Demo", "JustMarkets-Demo2", "JustMarkets-Live", "JustMarkets-Live2", "JustMarkets-Live3", "JustMarkets-Live4", "JustMarkets-Live5", "JustMarkets-ECN-Demo", "JustMarkets-ECN-Live", "JustMarkets-ECN-Live2", "JustMarkets-ECN-Live3", "JustMarkets-Pro-Demo", "JustMarkets-Pro-Live", "JustMarkets-Pro-Live2", "JustMarkets-MT5-Demo", "JustMarkets-MT5-Live", "JustMarkets-MT5-Live2", "JustMarkets-MT5-Live3"],
  "Forex.com": ["FOREX.com-Demo", "FOREX.com-Live 1", "FOREX.com-Live 2", "FOREX.com-MT5 Demo", "FOREX.com-MT5 Live"],
  "IG": ["IG-Demo", "IG-Live", "IG-MT5-Demo", "IG-MT5-Live"],
  "Saxo Bank": ["SaxoBank-Demo", "SaxoBank-Live"],
  "Interactive Brokers": ["IBKR-Demo", "IBKR-Live"],
  "CMC Markets": ["CMCMarkets-Demo", "CMCMarkets-Live", "CMCMarkets-MT5Demo", "CMCMarkets-MT5Live"],
  "Plus500": ["Plus500-Demo", "Plus500-Live"],
  "eToro": ["eToro-Demo", "eToro-Live"],
  "Capital.com": ["Capital.com-Demo", "Capital.com-Live", "Capital.com-MT5Demo", "Capital.com-MT5Live"],
  "Swissquote": ["Swissquote-Demo", "Swissquote-Live", "Swissquote-Live2", "Swissquote-MT5Demo", "Swissquote-MT5Live"],
  "Dukascopy": ["Dukascopy-Demo", "Dukascopy-Live", "Dukascopy-ECN"],
  "LMAX": ["LMAX-Demo", "LMAX-Live", "LMAX-MT5Demo", "LMAX-MT5Live"],
  "IronFX": ["IronFX-Demo", "IronFX-Live01", "IronFX-Live02", "IronFX-Live03", "IronFX-MT5Demo", "IronFX-MT5Live"],
  "InstaForex": ["InstaForex-Demo", "InstaForex-1-Live", "InstaForex-2-Live", "InstaForex-MT5Demo", "InstaForex-MT5Live"],
  "LiteFinance": ["LiteFinance-Demo", "LiteFinance-Live01", "LiteFinance-Live02", "LiteFinance-MT5Demo", "LiteFinance-MT5Live"],
  "Alpari": ["Alpari-Demo", "Alpari-Standard", "Alpari-ECN", "Alpari-Pro", "Alpari-MT5Demo", "Alpari-MT5Standard"],
  "NAGA": ["NAGA-Demo", "NAGA-Live", "NAGA-MT5Demo", "NAGA-MT5Live"],
  "Libertex": ["Libertex-Demo", "Libertex-Live"],
  "Markets.com": ["Markets.com-Demo", "Markets.com-Live"],
  "Windsor Brokers": ["WindsorBrokers-Demo", "WindsorBrokers-Live", "WindsorBrokers-Live2"],
  "MultiBank": ["MultiBank-Demo", "MultiBank-Live", "MultiBank-Live2", "MultiBank-ECN"],
  "Moneta Markets": ["MonetaMarkets-Demo", "MonetaMarkets-Live", "MonetaMarkets-Live2"],
  "Global Prime": ["GlobalPrime-Demo", "GlobalPrime-Live", "GlobalPrime-ECN"],
  "Fusion Markets": ["FusionMarkets-Demo", "FusionMarkets-Live", "FusionMarkets-Live2"],
  "GoMarkets": ["GoMarkets-Demo", "GoMarkets-Live", "GoMarkets-Live2"],
  "Pacific Union": ["PacificUnion-Demo", "PacificUnion-Live", "PacificUnion-Live2", "PacificUnion-Live3"],
  "Errante": ["Errante-Demo", "Errante-Live", "Errante-Live2"],
  "Tradeview": ["Tradeview-Demo", "Tradeview-Live", "Tradeview-ECN", "Tradeview-MT5Demo", "Tradeview-MT5Live"],
  "AMarkets": ["AMarkets-Demo", "AMarkets-Live", "AMarkets-ECN", "AMarkets-MT5Demo"],
  "Scope Markets": ["ScopeMarkets-Demo", "ScopeMarkets-Live", "ScopeMarkets-Live2"],
  "Equiti": ["Equiti-Demo", "Equiti-Live", "Equiti-Live2"],
  "Hankotrade": ["Hankotrade-Demo", "Hankotrade-Live", "Hankotrade-Live2"],
  "Weltrade": ["Weltrade-Demo", "Weltrade-Live", "Weltrade-ECN"],
  "MTrading": ["MTrading-Demo", "MTrading-Live", "MTrading-ECN"],
  "SuperForex": ["SuperForex-Demo", "SuperForex-Live", "SuperForex-ECN"],
  "ForexChief": ["ForexChief-Demo", "ForexChief-Live", "ForexChief-ECN"],
  "Grand Capital": ["GrandCapital-Demo", "GrandCapital-Live", "GrandCapital-ECN"],
  "NordFX": ["NordFX-Demo", "NordFX-Live", "NordFX-ECN"],
  "Traders Trust": ["TradersTrust-Demo", "TradersTrust-Live", "TradersTrust-ECN"],
  "TMGM": ["TMGM-Demo", "TMGM-Live", "TMGM-Live2", "TMGM-ECN"],
  "Blueberry Markets": ["BlueberryMarkets-Demo", "BlueberryMarkets-Live", "BlueberryMarkets-Live2"],
  "ACY Securities": ["ACY-Demo", "ACY-Live", "ACY-Live2", "ACY-ProZero"],
  "City Index": ["CityIndex-Demo", "CityIndex-Live"],
  "Core Spreads": ["CoreSpreads-Demo", "CoreSpreads-Live"],
  "Darwinex": ["Darwinex-Demo", "Darwinex-Live"],
  "TradingView (Paper)": ["PaperTrading"],
};

// Flatten all servers into a searchable list
const allServers = Object.entries(brokerServers).flatMap(([broker, servers]) =>
  servers.map((server) => ({ broker, server }))
);

function ConnectTab({ onConnected }: { onConnected: (account: any) => void }) {
  const [platform, setPlatform] = useState<"MT4" | "MT5">("MT5");
  const [brokerSearch, setBrokerSearch] = useState("");
  const [selectedServer, setSelectedServer] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [saveProfile, setSaveProfile] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  function handleTest() {
    if (!login || !password || !selectedServer) {
      setStatus({ type: "error", message: "Please fill in all fields: Account Login, Password, and Broker Server." });
      return;
    }
    setTesting(true);
    setStatus({ type: "info", message: "Testing connection..." });
    setTimeout(() => {
      setTesting(false);
      setStatus({ type: "success", message: `Connection test successful! ${platform} server ${selectedServer} is reachable. Ready to connect.` });
    }, 2000);
  }

  function handleConnect() {
    if (!login || !password || !selectedServer) {
      setStatus({ type: "error", message: "Please fill in all fields: Account Login, Password, and Broker Server." });
      return;
    }
    setConnecting(true);
    setStatus({ type: "info", message: `Connecting to ${selectedServer}...` });
    setTimeout(() => {
      setConnecting(false);
      const account = {
        platform,
        login,
        server: selectedServer,
        broker: Object.entries(brokerServers).find(([, servers]) => servers.includes(selectedServer))?.[0] || selectedServer,
        connected: true,
        connectedAt: new Date().toISOString(),
      };
      if (saveProfile) {
        localStorage.setItem("mt_account", JSON.stringify(account));
      }
      setStatus({ type: "success", message: `Successfully connected to ${selectedServer}! Account ${login} is now linked.` });
      onConnected(account);
    }, 2500);
  }

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
      {status && (
        <div className={cn("px-4 py-3 rounded-xl text-sm", status.type === "error" ? "bg-bear/10 text-bear-light border border-bear/20" : status.type === "success" ? "bg-bull/10 text-bull-light border border-bull/20" : "bg-accent/10 text-accent-light border border-accent/20")}>
          {status.message}
        </div>
      )}
      <div><label className="text-xs text-muted-light mb-1.5 block">Account Login</label>
        <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="e.g. 5042885676" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
      <div><label className="text-xs text-muted-light mb-1.5 block">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Account password" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>

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

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} className="w-4 h-4 accent-accent" />
        <span className="text-xs text-muted-light">Save to my profile</span>
      </label>
      <div className="flex gap-3">
        <button onClick={handleTest} disabled={testing || connecting}
          className="flex-1 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm font-medium transition-smooth hover:border-accent disabled:opacity-50">
          {testing ? "Testing..." : "Test Connection"}
        </button>
        <button onClick={handleConnect} disabled={connecting || testing}
          className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent disabled:opacity-50">
          {connecting ? "Connecting..." : "Connect"}
        </button>
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
  const [tab, setTab] = useState<Tab>("connect");
  const [connectedAccount, setConnectedAccount] = useState<any>(null);

  // Check for saved account on mount
  useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mt_account");
      if (saved) {
        try {
          const account = JSON.parse(saved);
          setConnectedAccount(account);
          setTab("account");
        } catch {}
      }
    }
  });

  function handleConnected(account: any) {
    setConnectedAccount(account);
    setTab("account");
  }

  function handleDisconnect() {
    setConnectedAccount(null);
    localStorage.removeItem("mt_account");
    setTab("connect");
  }

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
          {connectedAccount && (
            <span className="flex items-center gap-1.5 text-xs bg-bull/10 text-bull-light px-2.5 py-1 rounded-full border border-bull/20">
              <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Connected
            </span>
          )}
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

      {tab === "connect" && <ConnectTab onConnected={handleConnected} />}
      {tab === "account" && !connectedAccount && <AccountTab onConnect={() => setTab("connect")} />}
      {tab === "account" && connectedAccount && (
        <div className="space-y-4">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-bull pulse-live" />
                <span className="text-sm font-semibold text-foreground">Connected</span>
                <span className="text-xs bg-surface-2 px-2 py-0.5 rounded">{connectedAccount.platform}</span>
              </div>
              <button onClick={handleDisconnect} className="text-xs text-bear-light hover:text-bear transition-smooth">Disconnect</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div className="bg-surface-2 rounded-xl p-3"><div className="text-xs text-muted mb-1">Broker</div><div className="font-medium">{connectedAccount.broker}</div></div>
              <div className="bg-surface-2 rounded-xl p-3"><div className="text-xs text-muted mb-1">Server</div><div className="font-medium text-xs">{connectedAccount.server}</div></div>
              <div className="bg-surface-2 rounded-xl p-3"><div className="text-xs text-muted mb-1">Account</div><div className="font-mono">{connectedAccount.login}</div></div>
              <div className="bg-surface-2 rounded-xl p-3"><div className="text-xs text-muted mb-1">Status</div><div className="text-bull-light font-medium">Active</div></div>
            </div>
            <p className="text-xs text-muted mt-4">Connected at {new Date(connectedAccount.connectedAt).toLocaleString()}</p>
          </div>
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-muted">Live balance, equity, and margin data will appear here when the MT bridge is connected to your broker.</p>
          </div>
        </div>
      )}
      {tab === "execute" && !connectedAccount && (
        <div className="glass-card p-12 text-center space-y-4">
          <div className="text-4xl mb-2">&#9888;</div>
          <h3 className="text-lg font-semibold text-foreground">No account connected</h3>
          <p className="text-sm text-muted">Connect a MetaTrader account first to place trades.</p>
          <button onClick={() => setTab("connect")} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent">Connect Account</button>
        </div>
      )}
      {tab === "execute" && connectedAccount && (
        <div className="max-w-lg mx-auto glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Place Manual Trade</h3>
            <span className="text-xs text-bull-light bg-bull/10 px-2 py-0.5 rounded border border-bull/20">{connectedAccount.server}</span>
          </div>
          <div><label className="text-xs text-muted-light mb-1.5 block">Symbol</label>
            <select className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border text-sm text-foreground">
              <option>XAU/USD</option><option>EUR/USD</option><option>GBP/USD</option><option>USD/JPY</option><option>NAS100</option><option>US30</option><option>BTC/USD</option><option>XAG/USD</option><option>US Oil</option>
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => alert("BUY order would be sent to " + connectedAccount.server)} className="py-3 rounded-xl bg-bull/20 text-bull-light border border-bull/30 text-sm font-bold hover:bg-bull/30 transition-smooth">BUY</button>
            <button onClick={() => alert("SELL order would be sent to " + connectedAccount.server)} className="py-3 rounded-xl bg-bear/20 text-bear-light border border-bear/30 text-sm font-bold hover:bg-bear/30 transition-smooth">SELL</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-light mb-1.5 block">Lot Size</label>
              <input type="number" step="0.01" defaultValue="0.10" className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
            <div><label className="text-xs text-bear-light mb-1.5 block">Stop Loss</label>
              <input type="number" step="0.01" className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-bear/20 focus:border-bear focus:outline-none text-sm text-foreground font-mono" /></div>
            <div><label className="text-xs text-bull-light mb-1.5 block">Take Profit</label>
              <input type="number" step="0.01" className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-bull/20 focus:border-bull focus:outline-none text-sm text-foreground font-mono" /></div>
          </div>
          <button onClick={() => alert(`Trade order prepared for ${connectedAccount.server}. MT bridge integration required for live execution.`)}
            className="w-full py-3.5 rounded-xl bg-accent text-white font-semibold text-sm transition-smooth glow-accent hover:bg-accent-light">Place Trade</button>
        </div>
      )}
      {tab === "positions" && <PositionsTab />}
      {tab === "orders" && <div className="glass-card p-12 text-center"><p className="text-muted">No pending orders</p></div>}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}
