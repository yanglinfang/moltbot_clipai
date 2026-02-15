/**
 * Rule-based intent classifier for the intelligent routing system.
 *
 * Classifies inbound messages into complexity levels that map to model tiers.
 * Uses pattern matching, heuristics, and keyword detection — no LLM call needed.
 *
 * Classification hierarchy (first match wins):
 *   1. Explicit model request (/model opus) → "explicit"
 *   2. Trivial (greetings, acks, single emoji) → "trivial"
 *   3. Simple (short factual Q, time/date, definitions) → "simple"
 *   4. Flagship (mock interview, deep system design) → "flagship"
 *   5. Complex (multi-part, code review, system design) → "complex"
 *   6. Standard (everything else) → "standard"
 */

import type { IntentComplexity } from "../config/types.intelligent-routing.js";

// ---------------------------------------------------------------------------
// Classification result
// ---------------------------------------------------------------------------

export type ClassificationResult = {
  /** The determined intent complexity. */
  intent: IntentComplexity;
  /** Confidence score 0–1. Higher = more certain about the classification. */
  confidence: number;
  /** Human-readable reason for the classification (for analytics/debugging). */
  reason: string;
  /** Signals detected during classification. */
  signals: ClassificationSignal[];
};

export type ClassificationSignal = {
  name: string;
  weight: number;
  matched: boolean;
};

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

/** Patterns that indicate a trivial message (no real LLM work needed). */
const TRIVIAL_PATTERNS: RegExp[] = [
  /^(hi|hey|hello|yo|sup|gm|gn|morning|night|thanks|thx|ty|ok|okay|k|yep|yup|nah|nope|lol|haha|lmao|brb|gtg|bye|cya)\s*[.!?]*$/i,
  /^[\p{Emoji}\s]+$/u, // emoji-only
  /^[👍👎❤️🔥💯✅🙏😂💀🤔]+$/u,
  /^(yes|no|y|n|sure|nah)\s*[.!?]*$/i,
];

/** Patterns indicating the user explicitly requested a model. */
const EXPLICIT_MODEL_PATTERNS: RegExp[] = [
  /^\/model\s+(opus|sonnet|haiku|gpt|gemini|qwen|llama)/i,
  /\buse\s+(opus|sonnet|gpt-?4|claude)\b/i,
  /\bswitch\s+to\s+(opus|sonnet|haiku)\b/i,
];

/** Keywords/patterns indicating flagship-level complexity. */
const FLAGSHIP_PATTERNS: RegExp[] = [
  /\bmock\s+interview\b/i,
  /\bfull\s+system\s+design\b/i,
  /\bdesign\s+.*\s+from\s+scratch\b/i,
  /\barchitect(?:ure)?\s+review\b/i,
  /\bdeep\s+dive\b/i,
  /\bcomprehensive\s+analysis\b/i,
  /\bwrite\s+a\s+(?:full|complete)\s+(?:implementation|solution)\b/i,
  /\bexplain\s+.*\s+in\s+depth\b/i,
  /\bpaper\s+review\b/i,
  /\bRFC\b/,
];

/** Keywords/patterns indicating complex messages. */
const COMPLEX_PATTERNS: RegExp[] = [
  /\bsystem\s+design\b/i,
  /\bcode\s+review\b/i,
  /\brefactor\b/i,
  /\bdebug\b/i,
  /\bimplement\b/i,
  /\boptimize\b/i,
  /\btrade-?offs?\b/i,
  /\bcompare\s+(?:and\s+)?contrast\b/i,
  /\bpros?\s+(?:and\s+)?cons?\b/i,
  /\bstep\s+by\s+step\b/i,
  /\bexplain\s+(?:how|why|when)\b/i,
  /\bwhat\s+(?:would|should)\s+happen\s+if\b/i,
  /```[\s\S]{50,}```/, // code blocks over 50 chars
  /\b(?:transformer|attention|backprop|gradient|loss\s+function|regularization)\b/i,
  /\b(?:kubernetes|docker|microservice|distributed|consensus|CAP\s+theorem)\b/i,
];

/** Keywords for simple messages (quick factual, short answers). */
const SIMPLE_PATTERNS: RegExp[] = [
  /^what\s+(?:is|are|was|were)\s+\w+\s*\??$/i,
  /^(?:define|definition\s+of)\s+\w+\s*\??$/i,
  /^how\s+(?:do|does)\s+\w+\s+work\s*\??$/i,
  /^what\s+time\b/i,
  /^what\s+day\b/i,
  /^when\s+is\b/i,
  /^(?:remind|reminder)\b/i,
  /^(?:translate|convert)\s+/i,
];

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify a message into an intent complexity level.
 *
 * The classifier runs pattern checks in priority order and accumulates
 * signals. The first decisive match wins; if no strong signal is found,
 * heuristics (message length, question marks, code blocks) contribute
 * to a weighted score that determines the final classification.
 */
export function classifyIntent(message: string): ClassificationResult {
  const trimmed = message.trim();
  const signals: ClassificationSignal[] = [];

  // Empty or near-empty messages
  if (trimmed.length === 0) {
    return { intent: "trivial", confidence: 1.0, reason: "empty message", signals };
  }

  // 1. Explicit model request — bypass routing entirely
  for (const pattern of EXPLICIT_MODEL_PATTERNS) {
    if (pattern.test(trimmed)) {
      signals.push({ name: "explicit_model_request", weight: 1.0, matched: true });
      return { intent: "explicit", confidence: 1.0, reason: "explicit model request", signals };
    }
  }

  // 2. Trivial patterns
  for (const pattern of TRIVIAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      signals.push({ name: "trivial_pattern", weight: 1.0, matched: true });
      return { intent: "trivial", confidence: 0.95, reason: "trivial pattern match", signals };
    }
  }

  // Very short messages (< 10 chars, not a question) are likely trivial
  if (trimmed.length < 10 && !trimmed.includes("?")) {
    signals.push({ name: "very_short", weight: 0.8, matched: true });
    return { intent: "trivial", confidence: 0.8, reason: "very short non-question", signals };
  }

  // 3. Flagship patterns (check before complex — flagship is a superset)
  let flagshipScore = 0;
  for (const pattern of FLAGSHIP_PATTERNS) {
    const matched = pattern.test(trimmed);
    signals.push({ name: `flagship:${pattern.source.slice(0, 30)}`, weight: 0.4, matched });
    if (matched) flagshipScore += 0.4;
  }
  if (flagshipScore >= 0.4) {
    return {
      intent: "flagship",
      confidence: Math.min(0.95, 0.6 + flagshipScore),
      reason: "flagship keyword match",
      signals,
    };
  }

  // 4. Complex patterns
  let complexScore = 0;
  for (const pattern of COMPLEX_PATTERNS) {
    const matched = pattern.test(trimmed);
    signals.push({ name: `complex:${pattern.source.slice(0, 30)}`, weight: 0.25, matched });
    if (matched) complexScore += 0.25;
  }

  // Length-based complexity signals
  const wordCount = trimmed.split(/\s+/).length;
  const hasCodeBlock = /```/.test(trimmed);
  const hasMultipleQuestions = (trimmed.match(/\?/g) || []).length >= 2;
  const hasNumberedList = /^\s*\d+[.)]\s/m.test(trimmed);

  if (wordCount > 100) {
    signals.push({ name: "long_message", weight: 0.3, matched: true });
    complexScore += 0.3;
  } else if (wordCount > 50) {
    signals.push({ name: "medium_message", weight: 0.15, matched: true });
    complexScore += 0.15;
  }

  if (hasCodeBlock) {
    signals.push({ name: "code_block", weight: 0.3, matched: true });
    complexScore += 0.3;
  }

  if (hasMultipleQuestions) {
    signals.push({ name: "multiple_questions", weight: 0.2, matched: true });
    complexScore += 0.2;
  }

  if (hasNumberedList) {
    signals.push({ name: "numbered_list", weight: 0.15, matched: true });
    complexScore += 0.15;
  }

  if (complexScore >= 0.5) {
    return {
      intent: "complex",
      confidence: Math.min(0.9, 0.5 + complexScore * 0.4),
      reason: "complex signal accumulation",
      signals,
    };
  }

  // 5. Simple patterns
  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(trimmed)) {
      signals.push({ name: "simple_pattern", weight: 0.7, matched: true });
      return { intent: "simple", confidence: 0.8, reason: "simple pattern match", signals };
    }
  }

  // Short-ish messages without complexity signals → simple
  if (wordCount <= 15 && complexScore < 0.25) {
    signals.push({ name: "short_no_complexity", weight: 0.6, matched: true });
    return {
      intent: "simple",
      confidence: 0.7,
      reason: "short message without complexity",
      signals,
    };
  }

  // 6. Default to standard
  return {
    intent: "standard",
    confidence: 0.6,
    reason: "no strong signal — default to standard",
    signals,
  };
}
