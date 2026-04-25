import { prisma } from "@/lib/prisma";
import { mapSymbolForBroker } from "@/lib/trading/symbol-mapping";
import { computeExposure, wouldExceedLimit } from "@/lib/brain/exposure";

// Currency-exposure caps applied to every algo route. The % cap pulls
// from ExecutionAccount.maxCurrencyExposurePct (already in the schema);
// the count cap is hard-coded for v1 and can be lifted to a per-bot or
// per-account field later if needed.
const MAX_NET_SAME_DIRECTION_PER_CURRENCY = 4;
import { validateOrderTicket } from "@/lib/trading/validation";
import { resolveAdapter, type NormalizedOrder } from "@/lib/trading/adapter";

/**
 * Server-side algo runtime — the thing that actually routes trades.
 *
 * Runs every scan cycle (2 min) and for each enabled AlgoBotConfig:
 *   1. Picks up A+/A TradeSetups that match the bot's strategy + symbol
 *      + session filters and haven't already been routed.
 *   2. Validates the setup against the bot's risk/position limits.
 *   3. For each linked MT account selected on the bot, submits a
 *      market order through the existing trading-execute pipeline
 *      (symbol mapping → validator → adapter → request/result rows).
 *   4. Records an AlgoBotExecution row so the same setup is never
 *      routed twice for the same (bot, account).
 *
 * All MT routing reuses the machinery already proven by the manual
 * Execute Trade button, so news filter, kill switch, and adapter
 * behaviour behave the same way the user is used to.
 */

const SESSION_WINDOWS: Record<string, [number, number]> = {
  // UTC hour ranges (inclusive start, exclusive end)
  asia: [0, 8],
  london: [7, 16],
  newyork: [12, 21],
  overlap: [12, 16],
};

function sessionOpen(allowedCsv: string, now = new Date()): boolean {
  if (!allowedCsv) return true;
  const hour = now.getUTCHours();
  const allowed = allowedCsv.split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.some((s) => {
    const range = SESSION_WINDOWS[s];
    if (!range) return true;
    return hour >= range[0] && hour < range[1];
  });
}

function csvToSet(csv: string | null | undefined): Set<string> {
  if (!csv) return new Set();
  return new Set(csv.split(",").map((s) => s.trim()).filter(Boolean));
}

export interface AlgoRuntimeResult {
  botsEvaluated: number;
  setupsConsidered: number;
  ordersRouted: number;
  filtered: number;
  errors: string[];
}

/**
 * Map a bot config's strategyFilter to a Prisma `where.setupType` clause.
 * Empty filter = accept all strategies (hub-style).
 */
function setupTypeFilter(strategyFilter: string) {
  const set = csvToSet(strategyFilter);
  if (set.size === 0) return undefined;
  return { in: [...set] };
}

export async function runAlgoRuntime(): Promise<AlgoRuntimeResult> {
  const result: AlgoRuntimeResult = {
    botsEvaluated: 0,
    setupsConsidered: 0,
    ordersRouted: 0,
    filtered: 0,
    errors: [],
  };

  const bots = await prisma.algoBotConfig.findMany({ where: { enabled: true, running: true } });
  if (bots.length === 0) return result;

  for (const bot of bots) {
    result.botsEvaluated++;

    try {
      if (!sessionOpen(bot.allowedSessions)) {
        result.filtered++;
        continue;
      }

      // Pull active A+/A setups that match this bot's strategy + symbol
      // filters, excluding anything already routed for this bot.
      const whereSetupType = setupTypeFilter(bot.strategyFilter);
      const symbolSet = csvToSet(bot.symbolFilter);

      const alreadyRouted = await prisma.algoBotExecution.findMany({
        where: { botId: bot.botId },
        select: { setupId: true },
        take: 500,
      });
      const routedIds = new Set(alreadyRouted.map((r: { setupId: string }) => r.setupId));

      const setups = await prisma.tradeSetup.findMany({
        where: {
          status: "active",
          qualityGrade: { in: ["A+", "A"] },
          ...(whereSetupType ? { setupType: whereSetupType } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      });

      // Respect maxOpenPositions across this bot's routed orders today.
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const openCount = await prisma.algoBotExecution.count({
        where: { botId: bot.botId, status: "routed", routedAt: { gte: todayStart } },
      });
      const budget = Math.max(0, (bot.maxOpenPositions ?? 3) - openCount);

      let routedThisRun = 0;
      for (const setup of setups) {
        result.setupsConsidered++;

        if (routedIds.has(setup.id)) continue; // already handled
        if (symbolSet.size > 0 && !symbolSet.has(setup.symbol)) {
          result.filtered++;
          continue;
        }
        if (setup.confidenceScore < bot.minScore) {
          result.filtered++;
          continue;
        }
        if (setup.riskReward < bot.minRiskReward) {
          result.filtered++;
          continue;
        }
        if (routedThisRun >= budget) break;

        // Event-risk guard: never route a new trade into a known high-risk
        // macro window. EventRiskSnapshot is refreshed by the brain scan
        // every 2 minutes; "high" means a high-impact event is within 60
        // minutes of this symbol's sensitive currencies.
        const eventRisk = await prisma.eventRiskSnapshot.findUnique({
          where: { symbol: setup.symbol },
        });
        if (eventRisk?.riskLevel === "high") {
          await prisma.algoBotExecution.create({
            data: {
              algoBotConfigId: bot.id,
              botId: bot.botId,
              setupId: setup.id,
              symbol: setup.symbol,
              direction: setup.direction,
              grade: setup.qualityGrade,
              accountLogin: csvToSet(bot.selectedAccounts).values().next().value ?? "",
              status: "filtered",
              rejectReason: `event_risk_high: ${eventRisk.nearestEventName ?? "imminent event"} in ${eventRisk.minutesToEvent ?? "?"}m`,
            },
          }).catch(() => { /* dedup unique */ });
          result.filtered++;
          continue;
        }

        // Currency-exposure guard (Blueprint § 11): forex risk isn't
        // isolated by pair. Long EURUSD + GBPUSD + AUDUSD + short USDCHF
        // is one big anti-USD position, not four uncorrelated trades.
        // Open positions live on the brain's paper ExecutionAccount;
        // for v1 we use the canonical "paper-default" account as the
        // shared book — the real-money MT accounts mirror its routing.
        const paperAccount = await prisma.executionAccount.findUnique({
          where: { name: "paper-default" },
          select: { id: true, currentBalance: true, maxCurrencyExposurePct: true },
        });
        if (paperAccount) {
          const openPositions = await prisma.executionPosition.findMany({
            where: { accountId: paperAccount.id, status: "open" },
            select: { symbol: true, direction: true, riskAmount: true },
          });
          const snapshot = computeExposure(openPositions);
          const candidateRisk = bot.sizingMode === "risk_percent"
            ? paperAccount.currentBalance * (bot.riskPercent / 100)
            : paperAccount.currentBalance * 0.005; // ~0.5% rough guess for fixed_lots
          const check = wouldExceedLimit(
            snapshot,
            { symbol: setup.symbol, direction: setup.direction, riskAmount: candidateRisk },
            {
              maxNetSameDirectionPerCurrency: MAX_NET_SAME_DIRECTION_PER_CURRENCY,
              maxRiskPctPerCurrency: paperAccount.maxCurrencyExposurePct,
              accountBalance: paperAccount.currentBalance,
            },
          );
          if (!check.allowed && check.triggered) {
            await prisma.algoBotExecution.create({
              data: {
                algoBotConfigId: bot.id,
                botId: bot.botId,
                setupId: setup.id,
                symbol: setup.symbol,
                direction: setup.direction,
                grade: setup.qualityGrade,
                accountLogin: csvToSet(bot.selectedAccounts).values().next().value ?? "",
                status: "filtered",
                rejectReason: `currency_exposure_overload: net ${check.triggered.afterCount} ${check.triggered.currency} positions would exceed cap (${check.reason})`,
              },
            }).catch(() => { /* dedup unique */ });
            result.filtered++;
            continue;
          }
        }

        // Load the admin's linked MT accounts selected for this bot.
        const accountLogins = [...csvToSet(bot.selectedAccounts)];
        if (accountLogins.length === 0) {
          result.filtered++;
          continue;
        }

        const accounts = await prisma.linkedTradingAccount.findMany({
          where: {
            accountLogin: { in: accountLogins },
            isActive: true,
            connectionStatus: "linked",
            ...(bot.ownerUserKey ? { userKey: bot.ownerUserKey } : {}),
          },
        });

        if (accounts.length === 0) {
          // Record one filtered row per setup so the dashboard shows why.
          await prisma.algoBotExecution.create({
            data: {
              algoBotConfigId: bot.id,
              botId: bot.botId,
              setupId: setup.id,
              symbol: setup.symbol,
              direction: setup.direction,
              grade: setup.qualityGrade,
              accountLogin: accountLogins[0] ?? "",
              status: "filtered",
              rejectReason: "no_linked_account",
            },
          }).catch(() => { /* dedup unique — fine */ });
          result.filtered++;
          continue;
        }

        for (const account of accounts) {
          try {
            const routed = await routeOne(bot, setup, account);
            if (routed) {
              result.ordersRouted++;
              routedThisRun++;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`${bot.botId}:${setup.id}:${account.accountLogin}: ${msg}`);
          }
        }
      }

      await prisma.algoBotConfig.update({
        where: { id: bot.id },
        data: { lastRunAt: new Date() },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${bot.botId}: ${msg}`);
      await prisma.algoBotConfig.update({
        where: { id: bot.id },
        data: { lastErrorAt: new Date(), lastErrorMessage: msg.slice(0, 500) },
      }).catch(() => { /* ignore */ });
    }
  }

  return result;
}

async function routeOne(
  bot: Awaited<ReturnType<typeof prisma.algoBotConfig.findFirst>> extends infer _T ? any : never,
  setup: Awaited<ReturnType<typeof prisma.tradeSetup.findFirst>> extends infer _T ? any : never,
  account: Awaited<ReturnType<typeof prisma.linkedTradingAccount.findFirst>> extends infer _T ? any : never,
): Promise<boolean> {
  if (!bot || !setup || !account) return false;

  // Idempotency: (bot, setup, account) is unique. If another runtime
  // pass already inserted, this throws — treat as not routed, not an error.
  const mapping = await mapSymbolForBroker({
    internalSymbol: setup.symbol,
    brokerName: account.brokerName,
    platformType: account.platformType as "MT4" | "MT5",
  });

  const side = setup.direction === "long" ? "buy" : "sell";

  const validation = validateOrderTicket(
    {
      accountId: account.id,
      internalSymbol: setup.symbol,
      side: side as "buy" | "sell",
      orderType: "market",
      requestedVolume: bot.fixedLotSize,
      sizingMode: "fixed_lots",
      entryPrice: null,
      stopLoss: setup.stopLoss ?? null,
      takeProfit: setup.takeProfit1 ?? null,
      timeInForce: "gtc",
      slippagePips: null,
      currentPrice: null,
      accountBalance: null,
    },
    {
      digits: mapping.rule?.digits ?? null,
      minVolume: mapping.rule?.minVolume ?? null,
      maxVolume: mapping.rule?.maxVolume ?? null,
      volumeStep: mapping.rule?.volumeStep ?? null,
    },
  );

  if (!validation.ok) {
    await prisma.algoBotExecution.create({
      data: {
        algoBotConfigId: bot.id,
        botId: bot.botId,
        setupId: setup.id,
        symbol: setup.symbol,
        direction: setup.direction,
        grade: setup.qualityGrade,
        accountLogin: account.accountLogin,
        accountId: account.id,
        status: "rejected",
        rejectReason: `validation: ${validation.error ?? "unknown"}`,
      },
    }).catch(() => { /* duplicate — idempotent */ });
    return false;
  }

  const request = await prisma.tradeExecutionRequest.create({
    data: {
      userKey: account.userKey,
      accountId: account.id,
      internalSymbol: setup.symbol,
      brokerSymbol: mapping.brokerSymbol,
      side,
      orderType: "market",
      requestedVolume: bot.fixedLotSize,
      sizingMode: "fixed_lots",
      riskPercent: null,
      entryPrice: null,
      stopLoss: setup.stopLoss ?? null,
      takeProfit: setup.takeProfit1 ?? null,
      timeInForce: "gtc",
      slippagePips: null,
      comment: `algo:${bot.botId}:${setup.id.slice(0, 8)}`,
      magicNumber: null,
      sourceType: "algo",
      sourceRef: setup.id,
      status: "pending_submission",
    },
  });

  const adapter = resolveAdapter(account.adapterKind);
  const normalized: NormalizedOrder = {
    requestId: request.id,
    brokerSymbol: mapping.brokerSymbol,
    side,
    orderType: "market",
    volume: bot.fixedLotSize,
    entryPrice: null,
    stopLoss: setup.stopLoss ?? null,
    takeProfit: setup.takeProfit1 ?? null,
    timeInForce: "gtc",
    expiresAt: null,
    slippagePips: null,
    magicNumber: null,
    comment: `algo:${bot.botId}`,
  };

  await prisma.tradeExecutionRequest.update({
    where: { id: request.id },
    data: { status: "submitted", submittedAt: new Date() },
  });

  let adapterResult;
  try {
    adapterResult = await adapter.submit(normalized, {
      accountLogin: account.accountLogin,
      brokerName: account.brokerName,
      serverName: account.serverName,
      platformType: account.platformType as "MT4" | "MT5",
      adapterConfigJson: account.adapterConfigJson,
    });
  } catch (err: unknown) {
    adapterResult = {
      executionStatus: "error" as const,
      rejectionReason: err instanceof Error ? err.message : String(err),
      adapterResponse: { error: String(err) },
    };
  }

  const persisted = await prisma.tradeExecutionResult.create({
    data: {
      requestId: request.id,
      executionStatus: adapterResult.executionStatus ?? "pending",
      brokerTicketRef: adapterResult.brokerTicketRef ?? null,
      fillPrice: adapterResult.fillPrice ?? null,
      filledVolume: adapterResult.filledVolume ?? null,
      remainingVolume: adapterResult.remainingVolume ?? null,
      slippagePips: adapterResult.slippagePips ?? null,
      commissionCost: adapterResult.commissionCost ?? null,
      swap: adapterResult.swap ?? null,
      rejectionReason: adapterResult.rejectionReason ?? null,
      adapterResponse: adapterResult.adapterResponse ? JSON.stringify(adapterResult.adapterResponse) : null,
    },
  });

  await prisma.tradeExecutionRequest.update({
    where: { id: request.id },
    data: {
      status: adapterResult.executionStatus === "error" ? "rejected" : "submitted",
    },
  });

  await prisma.algoBotExecution.create({
    data: {
      algoBotConfigId: bot.id,
      botId: bot.botId,
      setupId: setup.id,
      symbol: setup.symbol,
      direction: setup.direction,
      grade: setup.qualityGrade,
      accountLogin: account.accountLogin,
      accountId: account.id,
      status: adapterResult.executionStatus === "error" ? "rejected" : "routed",
      rejectReason: adapterResult.rejectionReason ?? null,
      tradeRequestId: request.id,
      tradeResultId: persisted.id,
      brokerOrderId: adapterResult.brokerTicketRef ?? null,
    },
  }).catch(() => { /* idempotency collision — fine */ });

  return adapterResult.executionStatus !== "error";
}
