/**
 * Model tier definitions for the intelligent routing system.
 *
 * Tiers represent capability levels (T0–T4) with associated metadata
 * about what each tier can handle. The router maps intent complexity
 * to the minimum tier that can serve it, then resolves a concrete model.
 *
 * Tier design:
 *   T0 — No model needed (canned response, lookup, regex)
 *   T1 — Local/small model (simple generation, short replies, cron reminders)
 *   T2 — Cloud fast (instruction following, conversation, moderate reasoning)
 *   T3 — Cloud smart (system design, multi-step reasoning, code review)
 *   T4 — Cloud best (mock interviews, deep technical analysis, novel problems)
 */

import type { ModelTierId, IntentComplexity } from "../config/types.intelligent-routing.js";
import type { ModelRef } from "./model-selection.js";

// ---------------------------------------------------------------------------
// Capability scores
// ---------------------------------------------------------------------------

/** Capability dimensions scored 0–1 for each tier. */
export type TierCapabilities = {
  /** Instruction following accuracy. */
  instructionFollowing: number;
  /** Multi-step reasoning depth. */
  reasoning: number;
  /** Code generation and review quality. */
  coding: number;
  /** Long-form coherent generation. */
  longFormGeneration: number;
  /** Factual accuracy / knowledge breadth. */
  knowledge: number;
  /** Context window utilization (relative). */
  contextUtilization: number;
};

/** Static metadata for a model tier. */
export type TierDefinition = {
  id: ModelTierId;
  name: string;
  description: string;
  /** Capability scores (0–1 scale). */
  capabilities: TierCapabilities;
  /** Estimated cost per 1K tokens (input) in USD. 0 = free/local. */
  costPer1kInput: number;
  /** Typical response latency bucket. */
  latency: "instant" | "fast" | "moderate" | "slow";
  /** Whether this tier requires a network call to an external API. */
  requiresNetwork: boolean;
};

// ---------------------------------------------------------------------------
// Tier registry
// ---------------------------------------------------------------------------

const TIER_DEFINITIONS: Record<ModelTierId, TierDefinition> = {
  t0: {
    id: "t0",
    name: "No Model",
    description: "Canned responses, lookups, regex — no LLM invocation needed.",
    capabilities: {
      instructionFollowing: 0,
      reasoning: 0,
      coding: 0,
      longFormGeneration: 0,
      knowledge: 0,
      contextUtilization: 0,
    },
    costPer1kInput: 0,
    latency: "instant",
    requiresNetwork: false,
  },
  t1: {
    id: "t1",
    name: "Local Small",
    description: "Local model for simple generation, short replies, and scheduled reminders.",
    capabilities: {
      instructionFollowing: 0.5,
      reasoning: 0.3,
      coding: 0.2,
      longFormGeneration: 0.3,
      knowledge: 0.4,
      contextUtilization: 0.3,
    },
    costPer1kInput: 0,
    latency: "slow",
    requiresNetwork: false,
  },
  t2: {
    id: "t2",
    name: "Cloud Fast",
    description: "Cloud model for conversation, instruction following, and moderate reasoning.",
    capabilities: {
      instructionFollowing: 0.85,
      reasoning: 0.7,
      coding: 0.7,
      longFormGeneration: 0.75,
      knowledge: 0.8,
      contextUtilization: 0.8,
    },
    costPer1kInput: 0.003,
    latency: "fast",
    requiresNetwork: true,
  },
  t3: {
    id: "t3",
    name: "Cloud Smart",
    description: "Cloud model for system design, multi-step reasoning, and code review.",
    capabilities: {
      instructionFollowing: 0.95,
      reasoning: 0.9,
      coding: 0.9,
      longFormGeneration: 0.9,
      knowledge: 0.9,
      contextUtilization: 0.9,
    },
    costPer1kInput: 0.015,
    latency: "moderate",
    requiresNetwork: true,
  },
  t4: {
    id: "t4",
    name: "Cloud Best",
    description: "Premium cloud model for mock interviews, deep analysis, and novel problems.",
    capabilities: {
      instructionFollowing: 1.0,
      reasoning: 1.0,
      coding: 1.0,
      longFormGeneration: 1.0,
      knowledge: 1.0,
      contextUtilization: 1.0,
    },
    costPer1kInput: 0.015,
    latency: "moderate",
    requiresNetwork: true,
  },
};

/** Get the definition for a tier. */
export function getTierDefinition(tier: ModelTierId): TierDefinition {
  return TIER_DEFINITIONS[tier];
}

/** Get all tier definitions ordered T0 → T4. */
export function getAllTierDefinitions(): TierDefinition[] {
  return TIER_ORDER.map((id) => TIER_DEFINITIONS[id]);
}

// ---------------------------------------------------------------------------
// Intent → Tier mapping
// ---------------------------------------------------------------------------

/** Ordered tier IDs from cheapest to most capable. */
export const TIER_ORDER: ModelTierId[] = ["t0", "t1", "t2", "t3", "t4"];

/** Default mapping from intent complexity to minimum required tier. */
const INTENT_TO_MIN_TIER: Record<IntentComplexity, ModelTierId> = {
  trivial: "t0",
  simple: "t1",
  standard: "t2",
  complex: "t3",
  flagship: "t4",
  explicit: "t4", // explicit model requests bypass routing
};

/**
 * Resolve the minimum tier required for a given intent complexity.
 * Returns the tier ID from the default mapping.
 */
export function resolveMinTierForIntent(intent: IntentComplexity): ModelTierId {
  return INTENT_TO_MIN_TIER[intent];
}

// ---------------------------------------------------------------------------
// Default model mappings
// ---------------------------------------------------------------------------

/** Default model refs per tier (used when config doesn't specify overrides). */
const DEFAULT_TIER_MODELS: Record<ModelTierId, ModelRef | null> = {
  t0: null, // no model needed
  t1: { provider: "ollama", model: "qwen2.5:7b" },
  t2: { provider: "anthropic", model: "claude-sonnet-4-5" },
  t3: { provider: "anthropic", model: "claude-sonnet-4-5" },
  t4: { provider: "anthropic", model: "claude-opus-4-5" },
};

/** Get the default model ref for a tier. Returns null for T0. */
export function getDefaultTierModel(tier: ModelTierId): ModelRef | null {
  return DEFAULT_TIER_MODELS[tier];
}

// ---------------------------------------------------------------------------
// Tier comparison utilities
// ---------------------------------------------------------------------------

/** Numeric index for tier comparison (t0=0, t4=4). */
export function tierIndex(tier: ModelTierId): number {
  return TIER_ORDER.indexOf(tier);
}

/** Returns true if `a` is a higher (more capable) tier than `b`. */
export function isHigherTier(a: ModelTierId, b: ModelTierId): boolean {
  return tierIndex(a) > tierIndex(b);
}

/** Returns the higher of two tiers. */
export function maxTier(a: ModelTierId, b: ModelTierId): ModelTierId {
  return tierIndex(a) >= tierIndex(b) ? a : b;
}

/** Clamp a tier to a maximum (for budget downgrade). */
export function clampTier(tier: ModelTierId, maxAllowed: ModelTierId): ModelTierId {
  return tierIndex(tier) <= tierIndex(maxAllowed) ? tier : maxAllowed;
}
