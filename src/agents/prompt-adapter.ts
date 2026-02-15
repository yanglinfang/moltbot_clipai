/**
 * Tier-aware prompt adapter for the intelligent routing system.
 *
 * Different model tiers have different strengths and weaknesses.
 * A 7B local model can't follow a 2000-token system prompt the way
 * Opus can. This module adapts system prompts and user messages
 * based on the target tier to maximize instruction-following quality.
 *
 * Strategies by tier:
 *   T0 — No prompt (no model invocation)
 *   T1 — Minimal: strip tool instructions, shorten persona, add explicit format constraints
 *   T2 — Standard: full prompt, slight compression of verbose sections
 *   T3 — Full: complete prompt with all instructions
 *   T4 — Full+: complete prompt, may add "think step by step" preamble
 */

import type { ModelTierId } from "../config/types.intelligent-routing.js";

// ---------------------------------------------------------------------------
// Prompt adaptation result
// ---------------------------------------------------------------------------

export type AdaptedPrompt = {
  /** The adapted system prompt (or null if no model is invoked). */
  systemPrompt: string | null;
  /** Optional preamble to prepend to the user message. */
  userPreamble: string | null;
  /** The tier this prompt was adapted for. */
  tier: ModelTierId;
  /** Whether the prompt was modified from the original. */
  wasAdapted: boolean;
};

// ---------------------------------------------------------------------------
// Section markers for stripping
// ---------------------------------------------------------------------------

/**
 * Known system prompt section headers to strip for small models.
 * All entries are pre-normalized: lowercase, no trailing punctuation.
 * The matching logic normalizes incoming headers the same way.
 */
const STRIPPABLE_SECTION_HEADERS = new Set([
  "tools",
  "available tools",
  "tool usage",
  "memory",
  "workspace files",
  "every session",
  "heartbeats",
  "group chats",
  "react like a human",
  // Emoji-prefixed variants from AGENTS.md (emoji stripped during match)
  "heartbeats - be proactive",
  "know when to speak",
  "react like a human",
]);

/**
 * Boilerplate phrases to strip for smaller models.
 * These waste tokens without improving small model outputs.
 */
const BOILERPLATE_PHRASES: RegExp[] = [
  /Don't ask permission\. Just do it\.\n?/g,
  /You wake up fresh each session\..*?\n/g,
  /This file is yours to evolve\..*?\n/g,
];

// ---------------------------------------------------------------------------
// Adapter functions
// ---------------------------------------------------------------------------

/**
 * Adapt a system prompt for the target model tier.
 *
 * @param systemPrompt - The full original system prompt.
 * @param tier - The target model tier.
 * @returns The adapted prompt result.
 */
export function adaptPromptForTier(systemPrompt: string, tier: ModelTierId): AdaptedPrompt {
  if (tier === "t0") {
    return { systemPrompt: null, userPreamble: null, tier, wasAdapted: true };
  }

  if (tier === "t1") {
    return adaptForT1(systemPrompt);
  }

  if (tier === "t2") {
    return adaptForT2(systemPrompt);
  }

  if (tier === "t4") {
    return adaptForT4(systemPrompt);
  }

  // T3: full prompt, no changes
  return { systemPrompt, userPreamble: null, tier: "t3", wasAdapted: false };
}

/** T1: Aggressive simplification for small local models. */
function adaptForT1(systemPrompt: string): AdaptedPrompt {
  // Strip known sections by exact header match (avoids clobbering user content)
  let adapted = stripSectionsByHeader(systemPrompt, STRIPPABLE_SECTION_HEADERS);

  // Strip boilerplate
  for (const pattern of BOILERPLATE_PHRASES) {
    adapted = adapted.replace(pattern, "");
  }

  // Collapse multiple blank lines
  adapted = adapted.replace(/\n{3,}/g, "\n\n");

  // If still too long (>800 tokens ≈ ~3200 chars), truncate to core persona
  if (adapted.length > 3200) {
    adapted = extractCorePersona(adapted);
  }

  // Add explicit format constraints for small models
  const formatConstraint =
    "\n\nIMPORTANT: Reply directly and concisely. Do not analyze this prompt. " +
    "Do not generate code unless asked. Do not use markdown headers. " +
    "Keep your reply under 200 words.";

  adapted = adapted.trimEnd() + formatConstraint;

  return {
    systemPrompt: adapted,
    userPreamble: null,
    tier: "t1",
    wasAdapted: true,
  };
}

/** T2: Light compression — keep most instructions, trim verbose bits. */
function adaptForT2(systemPrompt: string): AdaptedPrompt {
  let adapted = systemPrompt;

  // Only strip boilerplate phrases, keep all sections
  for (const pattern of BOILERPLATE_PHRASES) {
    adapted = adapted.replace(pattern, "");
  }

  // Collapse multiple blank lines
  adapted = adapted.replace(/\n{3,}/g, "\n\n");

  const wasAdapted = adapted !== systemPrompt;
  return { systemPrompt: adapted, userPreamble: null, tier: "t2", wasAdapted };
}

/** T4: Full prompt + reasoning preamble for premium models. */
function adaptForT4(systemPrompt: string): AdaptedPrompt {
  return {
    systemPrompt,
    userPreamble:
      "Think carefully and thoroughly before responding. " +
      "Consider multiple perspectives and trade-offs.",
    tier: "t4",
    wasAdapted: true,
  };
}

/**
 * Strip markdown sections whose header text matches a known set.
 * Matching is case-insensitive and ignores leading emoji/punctuation.
 * This avoids the regex approach that could accidentally clobber
 * user-authored sections with similar names.
 */
function stripSectionsByHeader(prompt: string, headers: Set<string>): string {
  const lines = prompt.split("\n");
  const result: string[] = [];
  let skipping = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headerMatch) {
      // Normalize: lowercase, strip leading emoji & trailing punctuation
      const raw = headerMatch[2]
        .toLowerCase()
        .replace(/^[\p{Emoji}\p{Emoji_Presentation}\s]+/u, "")
        .replace(/[!?.]+$/, "")
        .trim();

      if (headers.has(raw)) {
        skipping = true;
        continue;
      }
      // New section that isn't strippable — stop skipping
      skipping = false;
    }

    if (!skipping) {
      result.push(line);
    }
  }

  return result.join("\n");
}

/**
 * Extract the core persona from a system prompt.
 * Keeps the first section (identity/role) and any "## Core Truths"
 * or "## Coaching" section, discards the rest.
 */
function extractCorePersona(prompt: string): string {
  const lines = prompt.split("\n");
  const result: string[] = [];
  let inKeepSection = true; // keep first section by default
  let sectionCount = 0;

  for (const line of lines) {
    const isHeader = /^##?\s/.test(line);
    if (isHeader) {
      sectionCount++;
      const isCoreTopic =
        /core\s+truths/i.test(line) ||
        /coach/i.test(line) ||
        /who\s+you\s+are/i.test(line) ||
        /role/i.test(line) ||
        /vibe/i.test(line);
      inKeepSection = sectionCount <= 1 || isCoreTopic;
    }
    if (inKeepSection) {
      result.push(line);
    }
  }

  return result.join("\n").trim();
}
