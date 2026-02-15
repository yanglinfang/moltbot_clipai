/**
 * Configuration types for the intelligent model routing system.
 *
 * The routing system classifies inbound messages by intent complexity
 * and selects the appropriate model tier (T0–T4) based on capability
 * requirements, cost constraints, and user preferences.
 */

/** Model tier identifiers, ordered by capability. */
export type ModelTierId = "t0" | "t1" | "t2" | "t3" | "t4";

/** Intent complexity levels produced by the classifier. */
export type IntentComplexity =
  | "trivial"
  | "simple"
  | "standard"
  | "complex"
  | "flagship"
  | "explicit";

/** User preference for cost vs quality tradeoff. */
export type RoutingBias = "cost" | "balanced" | "quality";

/** Per-tier model assignment in config. */
export type TierModelConfig = {
  /** Model ref string, e.g. "ollama/qwen2.5:7b" or "anthropic/claude-sonnet-4-5". */
  model: string;
  /** Maximum tokens per request for this tier (optional budget cap). */
  maxTokens?: number;
};

/** Budget constraints for routing decisions. */
export type RoutingBudgetConfig = {
  /** Daily spend cap in USD. Routing downgrades when exceeded. */
  dailyCapUsd?: number;
  /** Monthly spend cap in USD. */
  monthlyCapUsd?: number;
  /** Prefer free (local) models when available for a given complexity. */
  preferFree?: boolean;
};

/** Top-level intelligent routing configuration. */
export type IntelligentRoutingConfig = {
  /** Feature flag: enable intelligent routing. Default: false. */
  enabled?: boolean;
  /** Bias the router toward cost savings or quality. Default: "balanced". */
  bias?: RoutingBias;
  /** Per-tier model assignments. Unset tiers fall back to global default. */
  tiers?: Partial<Record<ModelTierId, TierModelConfig>>;
  /** Budget constraints for automatic tier downgrade. */
  budget?: RoutingBudgetConfig;
  /** Enable JSONL analytics logging. Default: false. */
  analytics?: boolean;
  /** Custom analytics log path. Default: $STATE_DIR/logs/routing-analytics.jsonl. */
  analyticsPath?: string;
};
