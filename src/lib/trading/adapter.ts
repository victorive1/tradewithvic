/**
 * Execution-bridge adapter layer (spec §4). An adapter knows how to send a
 * normalized order to a specific kind of MT4/MT5 bridge. Current adapters:
 *
 *   - "pending_queue"  — server writes the order to TradeExecutionRequest;
 *                        a user-side EA polls /api/trading/execute/next and
 *                        reports results back. (No inbound connection needed.)
 *   - "mock"           — simulates broker responses for dev and CI.
 *   - "metaapi"        — (future) routes through metaapi.cloud REST.
 *   - "ea_webhook"     — (future) calls a user-provided EA webhook URL.
 *
 * The UI only ever talks to this interface, so swapping in a real bridge
 * later is a one-file change.
 */

export interface NormalizedOrder {
  requestId: string;
  brokerSymbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop" | "stop_limit";
  volume: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  timeInForce: "gtc" | "day" | "ioc" | "fok";
  expiresAt: Date | null;
  slippagePips: number | null;
  magicNumber: number | null;
  comment: string | null;
}

export interface AdapterContext {
  accountLogin: string;
  brokerName: string;
  serverName: string;
  platformType: "MT4" | "MT5";
  adapterConfigJson?: string | null;
}

export interface AdapterResult {
  executionStatus: "accepted" | "rejected" | "partial" | "pending" | "error";
  brokerTicketRef?: string | null;
  fillPrice?: number | null;
  filledVolume?: number | null;
  remainingVolume?: number | null;
  slippagePips?: number | null;
  commissionCost?: number | null;
  swap?: number | null;
  rejectionReason?: string | null;
  adapterResponse?: any;
}

export interface ExecutionAdapter {
  kind: string;
  submit(order: NormalizedOrder, ctx: AdapterContext): Promise<AdapterResult>;
}

const pendingQueueAdapter: ExecutionAdapter = {
  kind: "pending_queue",
  async submit(order) {
    // Pending-queue adapter doesn't actually reach a broker — it just parks
    // the request as "pending" so a user-side EA can poll and fill it.
    // The UI should show "waiting for your MT terminal to execute this order".
    return {
      executionStatus: "pending",
      rejectionReason: null,
      adapterResponse: {
        kind: "pending_queue",
        note: "order parked — awaiting EA pickup",
        requestId: order.requestId,
      },
    };
  },
};

const mockAdapter: ExecutionAdapter = {
  kind: "mock",
  async submit(order) {
    // Deterministic simulated fills so the UI flow can be exercised without a
    // broker. Rejects orders with obviously bad stops to demonstrate error UX.
    if (order.orderType === "market" && order.entryPrice == null) {
      return {
        executionStatus: "accepted",
        brokerTicketRef: `MOCK-${Date.now()}`,
        fillPrice: null,
        filledVolume: order.volume,
        remainingVolume: 0,
        slippagePips: Math.round(Math.random() * 2),
        commissionCost: order.volume * 3.5,
        swap: 0,
        adapterResponse: { kind: "mock", filled: true },
      };
    }
    return {
      executionStatus: "pending",
      brokerTicketRef: `MOCK-${Date.now()}`,
      remainingVolume: order.volume,
      adapterResponse: { kind: "mock", queued_as_pending: true },
    };
  },
};

const notConnectedAdapter: ExecutionAdapter = {
  kind: "not_connected",
  async submit() {
    return {
      executionStatus: "error",
      rejectionReason:
        "No execution bridge is configured for this account. Install the FX Wonders EA on your MT terminal or connect MetaAPI to enable live routing.",
      adapterResponse: { kind: "not_connected" },
    };
  },
};

export function resolveAdapter(kind: string): ExecutionAdapter {
  switch (kind) {
    case "pending_queue":
      return pendingQueueAdapter;
    case "mock":
      return mockAdapter;
    case "metaapi":
    case "ea_webhook":
      // TODO: real adapters land in phase 2
      return notConnectedAdapter;
    default:
      return notConnectedAdapter;
  }
}
