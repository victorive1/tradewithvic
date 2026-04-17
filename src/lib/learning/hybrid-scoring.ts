// Adaptive Intelligence - Hybrid Live Scoring Service
// Combines rules-based score with learned model score safely

import { prisma } from "@/lib/prisma";

export type ScoringMode = "rules_only" | "shadow" | "hybrid";

export interface HybridScoringInput {
  setupDecisionLogId: string;
  symbol: string;
  timeframe: string;
  direction: "buy" | "sell";
  rulesScore: number;
  isValid: boolean;
  featureVector: Record<string, any>;
}

export interface HybridScoringOutput {
  visibleScore: number;
  rulesScore: number;
  modelScore?: number;
  calibratedProbability?: number;
  scoringMode: ScoringMode;
  rulesWeight: number;
  modelWeight: number;
  activeModelVersion?: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  wasGuardrailApplied: boolean;
  guardrailReasons: string[];
  qualityLabel: string;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function scoreToLabel(score: number): string {
  if (score >= 90) return "A+ Elite";
  if (score >= 80) return "A Strong";
  if (score >= 70) return "B+ Tradeable";
  if (score >= 60) return "B Cautious";
  return "No Trade";
}

export async function getSystemControlState() {
  let state = await prisma.systemControlState.findFirst({ orderBy: { createdAt: "desc" } });
  if (!state) {
    state = await prisma.systemControlState.create({
      data: {
        scoringMode: "rules_only",
        rulesWeight: 1.0,
        modelWeight: 0.0,
      },
    });
  }
  return state;
}

export async function scoreSetup(input: HybridScoringInput): Promise<HybridScoringOutput> {
  const guardrailReasons: string[] = [];

  // Invalid setup = no trade
  if (!input.isValid) {
    const output: HybridScoringOutput = {
      visibleScore: 0, rulesScore: input.rulesScore,
      scoringMode: "rules_only", rulesWeight: 1, modelWeight: 0,
      fallbackUsed: true, fallbackReason: "setup_invalid_by_rules",
      wasGuardrailApplied: true, guardrailReasons: ["setup_invalid_by_rules"],
      qualityLabel: "No Trade",
    };
    await logScoringDecision(input.setupDecisionLogId, output);
    return output;
  }

  const controlState = await getSystemControlState();

  // Force rules-only mode
  if (controlState.forceRulesOnly || controlState.scoringMode === "rules_only") {
    const visibleScore = clamp(input.rulesScore);
    const output: HybridScoringOutput = {
      visibleScore, rulesScore: input.rulesScore,
      scoringMode: "rules_only", rulesWeight: 1, modelWeight: 0,
      activeModelVersion: controlState.activeModelVersion || undefined,
      fallbackUsed: false, wasGuardrailApplied: false, guardrailReasons,
      qualityLabel: scoreToLabel(visibleScore),
    };
    await logScoringDecision(input.setupDecisionLogId, output);
    return output;
  }

  // Shadow mode: visible score = rules, but log model prediction
  if (controlState.scoringMode === "shadow") {
    const visibleScore = clamp(input.rulesScore);
    // TODO: Run actual model inference here when model is trained
    const output: HybridScoringOutput = {
      visibleScore, rulesScore: input.rulesScore,
      scoringMode: "shadow", rulesWeight: 1, modelWeight: 0,
      activeModelVersion: controlState.activeModelVersion || undefined,
      fallbackUsed: false, wasGuardrailApplied: false, guardrailReasons,
      qualityLabel: scoreToLabel(visibleScore),
    };
    await logScoringDecision(input.setupDecisionLogId, output);
    return output;
  }

  // Hybrid mode: blend rules + model
  const rulesWeight = controlState.rulesWeight;
  const modelWeight = controlState.modelWeight;

  // TODO: Replace with real model inference
  const modelScore = input.rulesScore * 0.95; // Placeholder: model roughly agrees with rules

  let visibleScore = (input.rulesScore * rulesWeight) + (modelScore * modelWeight);

  // Guardrails
  let guardrailApplied = false;

  // Rules floor: low rules score can't become featured
  if (input.rulesScore < 60) {
    visibleScore = Math.min(visibleScore, 69);
    guardrailApplied = true;
    guardrailReasons.push("rules_floor_blocked_display");
  }

  // Elite protection: model can't push weak rules into A+
  if (input.rulesScore < 80 && visibleScore >= 90) {
    visibleScore = 89;
    guardrailApplied = true;
    guardrailReasons.push("elite_guardrail_applied");
  }

  visibleScore = clamp(visibleScore);

  const output: HybridScoringOutput = {
    visibleScore: Math.round(visibleScore),
    rulesScore: input.rulesScore,
    modelScore,
    scoringMode: "hybrid",
    rulesWeight, modelWeight,
    activeModelVersion: controlState.activeModelVersion || undefined,
    fallbackUsed: false,
    wasGuardrailApplied: guardrailApplied,
    guardrailReasons,
    qualityLabel: scoreToLabel(Math.round(visibleScore)),
  };

  await logScoringDecision(input.setupDecisionLogId, output);
  return output;
}

async function logScoringDecision(setupDecisionLogId: string, output: HybridScoringOutput) {
  try {
    await prisma.liveScoringLog.create({
      data: {
        setupDecisionLogId,
        scoringMode: output.scoringMode,
        rulesScore: output.rulesScore,
        modelScore: output.modelScore,
        calibratedProbability: output.calibratedProbability,
        visibleScore: output.visibleScore,
        rulesWeight: output.rulesWeight,
        modelWeight: output.modelWeight,
        activeModelVersion: output.activeModelVersion,
        fallbackUsed: output.fallbackUsed,
        fallbackReason: output.fallbackReason,
        guardrailApplied: output.wasGuardrailApplied,
        guardrailReasonsJson: JSON.stringify(output.guardrailReasons),
      },
    });
  } catch (e) {
    console.error("Failed to log scoring decision:", e);
  }
}
