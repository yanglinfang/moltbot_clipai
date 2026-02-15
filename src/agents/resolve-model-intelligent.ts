/**
 * Integration hook for the intelligent routing system.
 *
 * This module bridges the intelligent router with moltbot's existing
 * model selection flow. It's designed to be called early in the agent
 * turn pipeline as an optional pre-processor:
 *
 *   1. Check if intelligent routing is enabled (feature flag)
 *   2. If enabled, run the router to get a routing decision
 *   3. Return the decision (model ref + adapted prompt + metadata)
 *   4. The caller can use or ignore the decision
 *
 * Feature flag: config.intelligentRouting.enabled (default: false)
 * When disabled, this module returns null and the existing flow is unaffected.
 */

import type { MoltbotConfig } from "../config/config.js";
import type { IntelligentRoutingConfig } from "../config/types.intelligent-routing.js";
import type { ModelRef } from "./model-selection.js";
import { routeMessage } from "./intelligent-router.js";
import type { RoutingDecision } from "./intelligent-router.js";
import { createRoutingAnalyticsLogger } from "./routing-analytics.js";
import type { RoutingAnalyticsLogger } from "./routing-analytics.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agent/intelligent-routing");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type IntelligentRoutingResult = {
  /** The routing decision with model, tier, classification, and adapted prompt. */
  decision: RoutingDecision;
  /** Whether the caller should use the adapted system prompt. */
  useAdaptedPrompt: boolean;
  /** Analytics logger instance (for recording completion events). */
  analytics: RoutingAnalyticsLogger | null;
};

/**
 * Resolve model via intelligent routing, if enabled.
 *
 * Returns null when:
 * - Intelligent routing is not enabled in config
 * - Config section is missing
 *
 * When it returns a result, the caller should:
 * - Use `result.decision.model` as the model ref
 * - Optionally use `result.decision.adaptedPrompt.systemPrompt` as the system prompt
 */
export function resolveModelIntelligent(params: {
  cfg: MoltbotConfig;
  message: string;
  systemPrompt: string;
  sessionModelOverride?: ModelRef;
  channel?: string;
  sessionId?: string;
  env?: NodeJS.ProcessEnv;
}): IntelligentRoutingResult | null {
  const routingConfig = resolveRoutingConfig(params.cfg);
  if (!routingConfig?.enabled) return null;

  const analytics = getOrCreateAnalyticsLogger(routingConfig, params.env);

  log.debug("intelligent routing enabled, classifying message", {
    messageLength: params.message.length,
    channel: params.channel,
  });

  const decision = routeMessage({
    message: params.message,
    systemPrompt: params.systemPrompt,
    cfg: params.cfg,
    routingConfig,
    sessionModelOverride: params.sessionModelOverride,
    channel: params.channel,
    sessionId: params.sessionId,
    analytics,
  });

  log.info("routing decision", {
    intent: decision.classification.intent,
    confidence: decision.classification.confidence,
    tier: decision.tier,
    model: `${decision.model.provider}/${decision.model.model}`,
    bypassed: decision.bypassed,
    promptAdapted: decision.adaptedPrompt.wasAdapted,
  });

  return {
    decision,
    useAdaptedPrompt: decision.adaptedPrompt.wasAdapted,
    analytics,
  };
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/** Extract the intelligent routing config from the main config. */
function resolveRoutingConfig(cfg: MoltbotConfig): IntelligentRoutingConfig | null {
  return cfg.intelligentRouting ?? null;
}

// ---------------------------------------------------------------------------
// Analytics singleton
// ---------------------------------------------------------------------------

let analyticsLogger: RoutingAnalyticsLogger | null = null;

function getOrCreateAnalyticsLogger(
  routingConfig: IntelligentRoutingConfig,
  env?: NodeJS.ProcessEnv,
): RoutingAnalyticsLogger | null {
  if (analyticsLogger) return analyticsLogger;

  analyticsLogger = createRoutingAnalyticsLogger({
    enabled: routingConfig.analytics ?? false,
    analyticsPath: routingConfig.analyticsPath,
    env,
  });

  return analyticsLogger;
}
