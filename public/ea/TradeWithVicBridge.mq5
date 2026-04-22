//+------------------------------------------------------------------+
//| TradeWithVic Bridge — EA-webhook client for MT5                  |
//| Polls the TradeWithVic server for pending orders, executes them  |
//| locally in your MT5 terminal, and reports fills back.            |
//|                                                                  |
//| Install:                                                         |
//|   1. Open MetaEditor (F4) in your MT5 terminal.                  |
//|   2. File → New → Expert Advisor → paste this file.              |
//|   3. Compile (F7). Attach to any chart on the account you        |
//|      connected in TradeWithVic.                                  |
//|   4. In the EA inputs, set WebhookSecret and AccountLogin        |
//|      to the values shown in the TradeWithVic UI.                 |
//|   5. Enable AutoTrading (Ctrl+E). Allow WebRequest for the       |
//|      server URL under Tools → Options → Expert Advisors.         |
//+------------------------------------------------------------------+
#property copyright   "TradeWithVic"
#property link        "https://tradewithvic.com"
#property version     "1.00"
#property strict

//--- User inputs
input string ServerUrl      = "https://tradewithvic.com";  // Base URL for the TradeWithVic API
input string AccountLogin   = "";                           // Your MT5 account login (as set in TradeWithVic)
input string WebhookSecret  = "";                           // Per-account secret from TradeWithVic UI
input int    PollSeconds    = 3;                            // Poll interval in seconds (>=1)
input int    HeartbeatSeconds = 60;                         // Heartbeat interval when idle
input int    MagicNumber    = 90210;                        // Magic number applied to all EA orders
input int    MaxSlippagePts = 20;                           // Max slippage in points per market order

//--- Runtime state
datetime g_lastPollAt = 0;
datetime g_lastHeartbeatAt = 0;

//+------------------------------------------------------------------+
//| Initialization                                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(WebhookSecret) < 8) {
      Print("TradeWithVicBridge: WebhookSecret is missing — open the TradeWithVic UI to generate one.");
      return(INIT_FAILED);
   }
   if(StringLen(AccountLogin) == 0) {
      Print("TradeWithVicBridge: AccountLogin is empty — set it in the EA inputs.");
      return(INIT_FAILED);
   }
   EventSetTimer(MathMax(1, PollSeconds));
   Print("TradeWithVicBridge: ready — polling ", ServerUrl, " every ", PollSeconds, "s for account ", AccountLogin);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }

//+------------------------------------------------------------------+
//| Timer: poll pending orders, execute, report back                 |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeCurrent();
   bool didWork = PullAndExecute();
   if(!didWork && (now - g_lastHeartbeatAt) >= HeartbeatSeconds) {
      Heartbeat();
      g_lastHeartbeatAt = now;
   }
}

//+------------------------------------------------------------------+
//| Hit /api/mt5/ea/pull, process each order                         |
//| Returns true if at least one order was processed.                |
//+------------------------------------------------------------------+
bool PullAndExecute()
{
   string url = ServerUrl + "/api/mt5/ea/pull?accountLogin=" + AccountLogin;
   string headers = BuildAuthHeaders();
   char data[], result[];
   string resHeaders;

   int code = WebRequest("GET", url, headers, 5000, data, result, resHeaders);
   if(code == -1) {
      PrintWebRequestError("pull", GetLastError());
      return false;
   }
   if(code != 200) {
      Print("TradeWithVicBridge: pull returned HTTP ", code, " body=", CharArrayToString(result));
      return false;
   }

   string body = CharArrayToString(result);
   // Very small JSON walk — we look for each "requestId":"..." occurrence
   // and parse the fields that follow. Good enough for the flat order shape
   // the server returns.
   int pos = 0;
   int processed = 0;
   while(true) {
      int idx = StringFind(body, "\"requestId\":\"", pos);
      if(idx < 0) break;
      int start = idx + 13;
      int end = StringFind(body, "\"", start);
      if(end < 0) break;
      string requestId = StringSubstr(body, start, end - start);

      string sym  = ExtractString(body, end, "symbol");
      string side = ExtractString(body, end, "side");
      double volume = ExtractNumber(body, end, "volume");
      double sl = ExtractNumber(body, end, "stopLoss");
      double tp = ExtractNumber(body, end, "takeProfit");
      double entry = ExtractNumber(body, end, "entryPrice");
      string orderType = ExtractString(body, end, "orderType");
      string comment = ExtractString(body, end, "comment");

      ExecuteOrder(requestId, sym, side, orderType, volume, entry, sl, tp, comment);
      processed++;
      pos = end + 1;
   }
   return processed > 0;
}

//+------------------------------------------------------------------+
//| Execute one order, then POST the result to /api/mt5/ea/ack       |
//+------------------------------------------------------------------+
void ExecuteOrder(string requestId, string symbol, string side, string orderType,
                  double volume, double entry, double sl, double tp, string comment)
{
   if(!SymbolSelect(symbol, true)) {
      AckResult(requestId, "error", "", 0, 0, "unknown symbol " + symbol);
      return;
   }

   MqlTradeRequest  req;  ZeroMemory(req);
   MqlTradeResult   res;  ZeroMemory(res);

   req.action   = TRADE_ACTION_DEAL;                 // market order
   if(orderType == "limit")     req.action = TRADE_ACTION_PENDING;
   else if(orderType == "stop") req.action = TRADE_ACTION_PENDING;

   req.symbol   = symbol;
   req.volume   = volume;
   req.type     = (side == "buy") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(orderType == "limit") req.type = (side == "buy") ? ORDER_TYPE_BUY_LIMIT : ORDER_TYPE_SELL_LIMIT;
   if(orderType == "stop")  req.type = (side == "buy") ? ORDER_TYPE_BUY_STOP  : ORDER_TYPE_SELL_STOP;

   if(orderType == "market") {
      req.price = (side == "buy")
                  ? SymbolInfoDouble(symbol, SYMBOL_ASK)
                  : SymbolInfoDouble(symbol, SYMBOL_BID);
   } else {
      req.price = entry;
   }

   if(sl > 0) req.sl = sl;
   if(tp > 0) req.tp = tp;

   req.deviation = MaxSlippagePts;
   req.magic     = MagicNumber;
   req.type_time = ORDER_TIME_GTC;
   req.comment   = StringLen(comment) > 0 ? comment : "twv";

   bool ok = OrderSend(req, res);
   if(!ok) {
      AckResult(requestId, "error", "", 0, 0,
                "OrderSend failed retcode=" + IntegerToString(res.retcode) + " err=" + IntegerToString(GetLastError()));
      return;
   }

   if(res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_PLACED) {
      AckResult(requestId, "filled", IntegerToString((long)res.order), res.price, res.volume, "");
   } else if(res.retcode == TRADE_RETCODE_DONE_PARTIAL) {
      AckResult(requestId, "partial", IntegerToString((long)res.order), res.price, res.volume, "partial fill");
   } else {
      AckResult(requestId, "rejected", "", 0, 0,
                "retcode=" + IntegerToString(res.retcode) + " " + res.comment);
   }
}

//+------------------------------------------------------------------+
//| POST /api/mt5/ea/ack with the execution outcome                  |
//+------------------------------------------------------------------+
void AckResult(string requestId, string execStatus, string ticketRef,
               double fillPrice, double filledVolume, string rejectReason)
{
   string url = ServerUrl + "/api/mt5/ea/ack";
   string headers = BuildAuthHeaders() + "Content-Type: application/json\r\n";
   string payload = StringFormat(
      "{\"accountLogin\":\"%s\",\"requestId\":\"%s\",\"executionStatus\":\"%s\","
      "\"brokerTicketRef\":\"%s\",\"fillPrice\":%.5f,\"filledVolume\":%.2f,"
      "\"rejectionReason\":\"%s\"}",
      AccountLogin, requestId, execStatus, ticketRef, fillPrice, filledVolume,
      EscapeJson(rejectReason));
   char body[], result[]; StringToCharArray(payload, body, 0, StringLen(payload), CP_UTF8);
   string resHeaders;
   int code = WebRequest("POST", url, headers, 5000, body, result, resHeaders);
   if(code == -1) PrintWebRequestError("ack", GetLastError());
   else if(code >= 400) Print("TradeWithVicBridge: ack HTTP ", code, " body=", CharArrayToString(result));
}

//+------------------------------------------------------------------+
//| Heartbeat — keep the UI showing this EA as online                |
//+------------------------------------------------------------------+
void Heartbeat()
{
   string url = ServerUrl + "/api/mt5/ea/ping";
   string headers = BuildAuthHeaders() + "Content-Type: application/json\r\n";
   string payload = "{\"accountLogin\":\"" + AccountLogin + "\"}";
   char body[], result[]; StringToCharArray(payload, body, 0, StringLen(payload), CP_UTF8);
   string resHeaders;
   int code = WebRequest("POST", url, headers, 5000, body, result, resHeaders);
   if(code == -1) PrintWebRequestError("ping", GetLastError());
}

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
string BuildAuthHeaders()
{
   return "x-ea-secret: " + WebhookSecret + "\r\n";
}

string ExtractString(string body, int from, string key)
{
   string needle = "\"" + key + "\":\"";
   int i = StringFind(body, needle, from);
   if(i < 0) return "";
   int s = i + StringLen(needle);
   int e = StringFind(body, "\"", s);
   if(e < 0) return "";
   return StringSubstr(body, s, e - s);
}

double ExtractNumber(string body, int from, string key)
{
   string needle = "\"" + key + "\":";
   int i = StringFind(body, needle, from);
   if(i < 0) return 0.0;
   int s = i + StringLen(needle);
   // stop at , or }
   int c1 = StringFind(body, ",", s);
   int c2 = StringFind(body, "}", s);
   int e = (c1 > 0 && (c2 < 0 || c1 < c2)) ? c1 : c2;
   if(e < 0) return 0.0;
   string raw = StringSubstr(body, s, e - s);
   StringTrimLeft(raw); StringTrimRight(raw);
   if(raw == "null") return 0.0;
   return StringToDouble(raw);
}

string EscapeJson(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", " ");
   StringReplace(s, "\r", " ");
   return s;
}

void PrintWebRequestError(string op, int err)
{
   Print("TradeWithVicBridge: ", op, " WebRequest failed — err=", err,
         ". Make sure ", ServerUrl, " is in Tools → Options → Expert Advisors → Allow WebRequest.");
}
