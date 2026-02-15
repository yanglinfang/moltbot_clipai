/**
 * Intelligent model router — the core decision engine.
 *
 * Pipeline:
 *   1. Classify intent (rule-based, no LLM call)
 *   2. Map intent → minimum tier
 *   3. Apply budget constraints (downgrade if over cap)
 *   4. Apply user bias (cost/balanced/quality)
 *   5. Resolve tier → concrete model ref
 *   6. Adapt system prompt for selected tier
 *   7. Log analytics event
 *
 * The router is stateless — all state (budget tracking, config) is
 * passed in via the params object. This makes it testable and
 * composable with the existing model selection flow.
 */

import type { MoltbotConfig } from "../config/config.js";
import type {
  IntelligentRoutingConfig,
  ModelTierId,
  RoutingBias,
} from "../config/types.intelligent-routing.js";
import type { ModelRef } from "./model-selection.js";
import { parseModelRef } from "./model-selection.js";
import { DEFAULT_PROVIDER } from "./defaults.js";
import { classifyIntent } from "./intent-classifier.js";
import type { ClassificationResult } from "./intent-classifier.js";
import {
  resolveMinTierForIntent,
  getDefaultTierModel,
  clampTier,
  tierIndex,
  TIER_ORDER,
  getTierDefinition,
} from "./model-tiers.js";
import { adaptPromptForTier } from "./prompt-adapter.js";
import type { AdaptedPrompt } from "./prompt-adapter.js";
import type { RoutingAnalyticsLogger, RoutingAnalyticsEvent } from "./routing-analytics.js";

// ---------------------------------------------------------------------------
// Router result
// ---------------------------------------------------------------------------

export type RoutingDecision = {
  /** The resolved model to use. */
  model: ModelRef;
  /** The selected tier. */
  tier: ModelTierId;
  /** The original tier before any budget/bias adjustments. */
  originalTier: ModelTierId;
  /** Intent classification result. */
  classification: ClassificationResult;
  /** Adapted prompt for the selected tier. */
  adaptedPrompt: AdaptedPrompt;
  /** Whether the router was bypassed (explicit model request, session override, etc). */
  bypassed: boolean;
  /** Reason for bypass, if applicable. */
  bypassReason?: string;
};

// ---------------------------------------------------------------------------
// Router params
// ---------------------------------------------------------------------------

export type RouterParams = {
  /** The inbound user message to route. */
  message: string;
  /** The full system prompt (before adaptation). */
  systemPrompt: string;
  /** Moltbot config (for tier model overrides). */
  cfg: MoltbotConfig;
  /** Routing-specific config section. */
  routingConfig: IntelligentRoutingConfig;
  /** Session-level model override (from /model command). Bypasses routing. */
  sessionModelOverride?: ModelRef;
  /** Channel the message came from (for analytics). */
  channel?: string;
  /** Session ID (for analytics). */
  sessionId?: string;
  /** Analytics logger (optional). */
  analytics?: RoutingAnalyticsLogger | null;
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Route an inbound message to the appropriate model and adapted prompt.
 *
 * This is the main entry point for the intelligent routing system.
 * It's designed to be called early in the agent turn pipeline, before
 * the model is invoked.
 */
export function routeMessage(params: RouterParams): RoutingDecision {
  const { message, systemPrompt, cfg, routingConfig, sessionModelOverride } = params;

  // Bypass: session-level model override (user used /model command)
  if (sessionModelOverride) {
    const adaptedPrompt = adaptPromptForTier(systemPrompt, "t3");
    const classification = classifyIntent(message);
    const decision: RoutingDecision = {
      model: sessionModelOverride,
      tier: "t3",
      originalTier: "t3",
      classification,
      adaptedPrompt,
      bypassed: true,
      bypassReason: "session model override",
    };
    recordAnalytics(params, decision);
    return decision;
  }

  // Step 1: Classify intent
  const classification = classifyIntent(message);

  // Bypass: explicit model request in message
  if (classification.intent === "explicit") {
    const defaultModel = resolveModelForTier("t3", routingConfig, cfg);
    const adaptedPrompt = adaptPromptForTier(systemPrompt, "t3");
    const decision: RoutingDecision = {
      model: defaultModel,
      tier: "t3",
      originalTier: "t3",
      classification,
      adaptedPrompt,
      bypassed: true,
      bypassReason: "explicit model request in message",
    };
    recordAnalytics(params, decision);
    return decision;
  }

  // Step 2: Map intent to minimum tier
  const minTier = resolveMinTierForIntent(classification.intent);

  // Step 3: Apply bias adjustment
  const biasedTier = applyBias(minTier, routingConfig.bias ?? "balanced");

  // Step 4: Apply budget constraints (downgrade if needed)
  const budgetTier = applyBudgetConstraints(biasedTier, routingConfig);

  // Step 5: Resolve tier to model
  const model = resolveModelForTier(budgetTier, routingConfig, cfg);

  // Step 6: Adapt prompt
  const adaptedPrompt = adaptPromptForTier(systemPrompt, budgetTier);

  const decision: RoutingDecision = {
    model,
    tier: budgetTier,
    originalTier: minTier,
    classification,
    adaptedPrompt,
    bypassed: false,
  };

  // Step 7: Analytics
  recordAnalytics(params, decision);

  return decision;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Apply routing bias to shift the tier up or down.
 *
 * - "cost": downgrade one tier (but never below T1 for non-trivial)
 * - "balanced": no change
 * - "quality": upgrade one tier (but never above T4)
 */
function applyBias(tier: ModelTierId, bias: RoutingBias): ModelTierId {
  if (bias === "balanced") return tier;

  const idx = tierIndex(tier);

  if (bias === "cost") {
    // Don't downgrade T0 or T1 — they're already minimal
    if (idx <= 1) return tier;
    return TIER_ORDER[idx - 1]!;
  }

  if (bias === "quality") {
    // Don't upgrade T4 — it's already max
    if (idx >= 4) return tier;
    return TIER_ORDER[idx + 1]!;
  }

  return tier;
}

/**
 * Apply budget constraints — downgrade tier if spending limits are hit.
 *
 * - `preferFree`: always clamp to T1 (local models only)
 * - `dailyCapUsd`: if cumulative daily spend exceeds cap, clamp to T1
 * - `monthlyCapUsd`: if cumulative monthly spend exceeds cap, clamp to T1
 *
 * Spend tracking is provided via `currentSpend` on the budget config.
 * The caller is responsible for computing these from the analytics log.
 */
function applyBudgetConstraints(
  tier: ModelTierId,
  routingConfig: IntelligentRoutingConfig,
): ModelTierId {
  const budget = routingConfig.budget;
  if (!budget) return tier;

  // If preferFree is set, cap at T1 (local models only)
  if (budget.preferFree) {
    return clampTier(tier, "t1");
  }

  // Daily cap enforcement
  if (budget.dailyCapUsd != null && budget.currentSpend?.dailyUsd != null) {
    if (budget.currentSpend.dailyUsd >= budget.dailyCapUsd) {
      return clampTier(tier, "t1");
    }
  }

  // Monthly cap enforcement
  if (budget.monthlyCapUsd != null && budget.currentSpend?.monthlyUsd != null) {
    if (budget.currentSpend.monthlyUsd >= budget.monthlyCapUsd) {
      return clampTier(tier, "t1");
    }
  }

  return tier;
}

/**
 * Resolve a concrete model ref for a tier, checking config overrides first,
 * then falling back to built-in defaults.
 */
function resolveModelForTier(
  tier: ModelTierId,
  routingConfig: IntelligentRoutingConfig,
  cfg: MoltbotConfig,
): ModelRef {
  // Check config override for this tier
  const tierConfig = routingConfig.tiers?.[tier];
  if (tierConfig?.model) {
    const parsed = parseModelRef(tierConfig.model, DEFAULT_PROVIDER);
    if (parsed) return parsed;
  }

  // Fall back to built-in default
  const defaultModel = getDefaultTierModel(tier);
  if (defaultModel) return defaultModel;

  // Ultimate fallback: global configured model
  const globalPrimary = cfg.agents?.defaults?.model;
  if (typeof globalPrimary === "string") {
    const parsed = parseModelRef(globalPrimary, DEFAULT_PROVIDER);
    if (parsed) return parsed;
  }
  if (typeof globalPrimary === "object" && globalPrimary?.primary) {
    const parsed = parseModelRef(globalPrimary.primary, DEFAULT_PROVIDER);
    if (parsed) return parsed;
  }

  return { provider: DEFAULT_PROVIDER, model: "claude-sonnet-4-5" };
}

/** Resolve the API endpoint for a provider from the config. */
function resolveEndpoint(provider: string, cfg: MoltbotConfig): string | undefined {
  const providerConfig = cfg.models?.providers?.[provider];
  if (providerConfig && typeof providerConfig === "object" && "baseUrl" in providerConfig) {
    return (providerConfig as { baseUrl: string }).baseUrl;
  }
  // Well-known defaults
  if (provider === "anthropic") return "https://api.anthropic.com";
  if (provider === "openai") return "https://api.openai.com";
  return undefined;
}

/** Record an analytics event if the logger is available. */
function recordAnalytics(params: RouterParams, decision: RoutingDecision): void {
  if (!params.analytics?.enabled) return;

  const tierDef = getTierDefinition(decision.tier);
  const estimatedCostUsd = tierDef.costPer1kInput > 0 ? tierDef.costPer1kInput * 0.5 : null; // rough estimate

  const event: RoutingAnalyticsEvent = {
    ts: new Date().toISOString(),
    event: decision.bypassed
      ? "override"
      : decision.tier !== decision.originalTier
        ? "budget_downgrade"
        : "route",
    intent: decision.classification.intent,
    confidence: decision.classification.confidence,
    tier: decision.tier,
    originalTier: decision.tier !== decision.originalTier ? decision.originalTier : undefined,
    provider: decision.model.provider,
    model: decision.model.model,
    endpoint: resolveEndpoint(decision.model.provider, params.cfg),
    sessionId: params.sessionId,
    channel: params.channel,
    messageLength: params.message.length,
    estimatedCostUsd,
    classifierReason: decision.classification.reason,
    promptAdapted: decision.adaptedPrompt.wasAdapted,
  };

  params.analytics.record(event);
}

/**
 * Record a completion event with latency after the model call finishes.
 * Call this from the agent pipeline after the LLM response is received.
 */
export function recordRoutingCompletion(params: {
  analytics: RoutingAnalyticsLogger | null | undefined;
  decision: RoutingDecision;
  latencyMs: number;
  responseSize?: number;
  cfg: MoltbotConfig;
}): void {
  if (!params.analytics?.enabled) return;

  const event: RoutingAnalyticsEvent = {
    ts: new Date().toISOString(),
    event: "complete",
    intent: params.decision.classification.intent,
    confidence: params.decision.classification.confidence,
    tier: params.decision.tier,
    provider: params.decision.model.provider,
    model: params.decision.model.model,
    endpoint: resolveEndpoint(params.decision.model.provider, params.cfg),
    messageLength: 0,
    latencyMs: params.latencyMs,
    responseSize: params.responseSize,
    estimatedCostUsd: null,
    promptAdapted: params.decision.adaptedPrompt.wasAdapted,
  };

  params.analytics.record(event);
}
