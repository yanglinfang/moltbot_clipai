/**
 * JSONL analytics logger for the intelligent routing system.
 *
 * Records routing decisions, model usage, and cost data to a JSONL file
 * for offline analysis. Follows the same async-queue pattern as
 * anthropic-payload-log.ts to avoid blocking the main agent loop.
 *
 * Log path: $STATE_DIR/logs/routing-analytics.jsonl
 * Toggle: config.intelligentRouting.analytics = true
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { ModelTierId, IntentComplexity } from "../config/types.intelligent-routing.js";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agent/routing-analytics");

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type RoutingAnalyticsEvent = {
  /** ISO timestamp. */
  ts: string;
  /** Event type. */
  event: "route" | "complete" | "fallback" | "budget_downgrade" | "override";
  /** Classified intent complexity. */
  intent: IntentComplexity;
  /** Classifier confidence (0–1). */
  confidence: number;
  /** Tier selected by the router. */
  tier: ModelTierId;
  /** Original tier before any downgrade (if applicable). */
  originalTier?: ModelTierId;
  /** Resolved model provider. */
  provider: string;
  /** Resolved model ID. */
  model: string;
  /** API endpoint being called (e.g. "http://host.docker.internal:11434/v1"). */
  endpoint?: string;
  /** Session ID for grouping. */
  sessionId?: string;
  /** Channel the message came from. */
  channel?: string;
  /** Message length in characters. */
  messageLength: number;
  /** Model call latency in milliseconds (populated on "complete" events). */
  latencyMs?: number;
  /** Response size in characters (populated on "complete" events). */
  responseSize?: number;
  /** Estimated cost in USD for this request (null if local/free). */
  estimatedCostUsd: number | null;
  /** Classifier reason string. */
  classifierReason?: string;
  /** Whether prompt was adapted for the tier. */
  promptAdapted: boolean;
};

// ---------------------------------------------------------------------------
// Writer (async queue, same pattern as anthropic-payload-log.ts)
// ---------------------------------------------------------------------------

type LogWriter = {
  filePath: string;
  write: (line: string) => void;
};

const writers = new Map<string, LogWriter>();

function getWriter(filePath: string): LogWriter {
  const existing = writers.get(filePath);
  if (existing) return existing;

  const dir = path.dirname(filePath);
  const ready = fs.mkdir(dir, { recursive: true }).catch(() => undefined);
  let queue = Promise.resolve();

  const writer: LogWriter = {
    filePath,
    write: (line: string) => {
      queue = queue
        .then(() => ready)
        .then(() => fs.appendFile(filePath, line, "utf8"))
        .catch(() => undefined);
    },
  };

  writers.set(filePath, writer);
  return writer;
}

// ---------------------------------------------------------------------------
// Logger API
// ---------------------------------------------------------------------------

export type RoutingAnalyticsLogger = {
  enabled: true;
  record: (event: RoutingAnalyticsEvent) => void;
};

/**
 * Create a routing analytics logger.
 * Returns null if analytics is disabled.
 */
export function createRoutingAnalyticsLogger(params: {
  enabled: boolean;
  analyticsPath?: string;
  env?: NodeJS.ProcessEnv;
}): RoutingAnalyticsLogger | null {
  if (!params.enabled) return null;

  const env = params.env ?? process.env;
  const filePath =
    params.analyticsPath ?? path.join(resolveStateDir(env), "logs", "routing-analytics.jsonl");

  const writer = getWriter(filePath);

  const record = (event: RoutingAnalyticsEvent) => {
    try {
      const line = JSON.stringify(event);
      writer.write(`${line}\n`);
    } catch {
      // Swallow serialization errors — analytics should never crash the agent.
    }
  };

  log.info("routing analytics logger enabled", { filePath: writer.filePath });
  return { enabled: true, record };
}
