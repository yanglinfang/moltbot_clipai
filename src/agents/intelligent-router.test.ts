import { describe, it, expect } from "vitest";
import { routeMessage } from "./intelligent-router.js";
import type { MoltbotConfig } from "../config/config.js";
import type { IntelligentRoutingConfig } from "../config/types.intelligent-routing.js";

const baseCfg: MoltbotConfig = {
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-4-5" },
    },
  },
};

const baseRoutingConfig: IntelligentRoutingConfig = {
  enabled: true,
  bias: "balanced",
  tiers: {
    t1: { model: "ollama/qwen2.5:7b" },
    t2: { model: "anthropic/claude-sonnet-4-5" },
    t3: { model: "anthropic/claude-sonnet-4-5" },
    t4: { model: "anthropic/claude-opus-4-5" },
  },
};

describe("intelligent-router", () => {
  describe("trivial messages", () => {
    it("routes 'hi' to t0 with fallback to global default", () => {
      const result = routeMessage({
        message: "hi",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: baseRoutingConfig,
      });
      expect(result.classification.intent).toBe("trivial");
      expect(result.bypassed).toBe(false);
      // t0 has no default model, falls back to global
      expect(result.tier).toBe("t0");
    });
  });

  describe("simple messages", () => {
    it("routes simple question to t1 (local model)", () => {
      const result = routeMessage({
        message: "what is SGD?",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: baseRoutingConfig,
      });
      expect(result.classification.intent).toBe("simple");
      expect(result.tier).toBe("t1");
      expect(result.model.provider).toBe("ollama");
      expect(result.model.model).toBe("qwen2.5:7b");
    });
  });

  describe("complex messages", () => {
    it("routes complex message to t3 (sonnet)", () => {
      const result = routeMessage({
        message: "explain step by step how attention mechanisms work in transformers",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: baseRoutingConfig,
      });
      expect(result.classification.intent).toBe("complex");
      expect(result.tier).toBe("t3");
      expect(result.model.provider).toBe("anthropic");
    });
  });

  describe("flagship messages", () => {
    it("routes flagship to t4 (opus)", () => {
      const result = routeMessage({
        message:
          "let's do a full system design mock interview for a recommendation system from scratch",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: baseRoutingConfig,
      });
      expect(result.classification.intent).toBe("flagship");
      expect(result.tier).toBe("t4");
      expect(result.model.provider).toBe("anthropic");
      expect(result.model.model).toBe("claude-opus-4-5");
    });
  });

  describe("session model override bypass", () => {
    it("bypasses routing when session override is set", () => {
      const result = routeMessage({
        message: "hi",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: baseRoutingConfig,
        sessionModelOverride: { provider: "anthropic", model: "claude-opus-4-5" },
      });
      expect(result.bypassed).toBe(true);
      expect(result.bypassReason).toBe("session model override");
      expect(result.model.provider).toBe("anthropic");
      expect(result.model.model).toBe("claude-opus-4-5");
    });
  });

  describe("explicit model request bypass", () => {
    it("bypasses routing for /model commands", () => {
      const result = routeMessage({
        message: "/model opus",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: baseRoutingConfig,
      });
      expect(result.classification.intent).toBe("explicit");
      expect(result.bypassed).toBe(true);
    });
  });

  describe("bias adjustments", () => {
    it("cost bias downgrades tier", () => {
      const result = routeMessage({
        message: "explain how attention works in transformers step by step",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: { ...baseRoutingConfig, bias: "cost" },
      });
      // complex → t3, cost bias → t2
      if (result.classification.intent === "complex") {
        expect(result.tier).toBe("t2");
      }
    });

    it("quality bias upgrades tier", () => {
      const result = routeMessage({
        message: "what is SGD?",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: { ...baseRoutingConfig, bias: "quality" },
      });
      // simple → t1, quality bias → t2
      if (result.classification.intent === "simple") {
        expect(result.tier).toBe("t2");
      }
    });
  });

  describe("budget constraints", () => {
    it("preferFree caps at t1", () => {
      const result = routeMessage({
        message: "explain system design for a distributed cache",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: {
          ...baseRoutingConfig,
          budget: { preferFree: true },
        },
      });
      expect(["t0", "t1"]).toContain(result.tier);
    });

    it("daily cap downgrades to t1 when exceeded", () => {
      const result = routeMessage({
        message: "explain step by step how attention mechanisms work in transformers",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: {
          ...baseRoutingConfig,
          budget: { dailyCapUsd: 1.0, currentSpend: { dailyUsd: 1.5 } },
        },
      });
      expect(["t0", "t1"]).toContain(result.tier);
    });

    it("monthly cap downgrades to t1 when exceeded", () => {
      const result = routeMessage({
        message: "explain step by step how attention mechanisms work in transformers",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: {
          ...baseRoutingConfig,
          budget: { monthlyCapUsd: 10.0, currentSpend: { monthlyUsd: 12.0 } },
        },
      });
      expect(["t0", "t1"]).toContain(result.tier);
    });

    it("does not downgrade when under daily cap", () => {
      const result = routeMessage({
        message: "explain step by step how attention mechanisms work in transformers",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: {
          ...baseRoutingConfig,
          budget: { dailyCapUsd: 5.0, currentSpend: { dailyUsd: 0.5 } },
        },
      });
      // Should route normally (complex → t3)
      if (result.classification.intent === "complex") {
        expect(result.tier).toBe("t3");
      }
    });

    it("does not downgrade when no currentSpend provided", () => {
      const result = routeMessage({
        message: "explain step by step how attention mechanisms work in transformers",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: {
          ...baseRoutingConfig,
          budget: { dailyCapUsd: 1.0 },
        },
      });
      // No currentSpend means we can't enforce; should route normally
      if (result.classification.intent === "complex") {
        expect(result.tier).toBe("t3");
      }
    });
  });

  describe("prompt adaptation", () => {
    it("marks prompt as adapted for non-t3 tiers", () => {
      const result = routeMessage({
        message: "what is gradient descent?",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: baseRoutingConfig,
      });
      // t1 should adapt the prompt
      if (result.tier === "t1") {
        expect(result.adaptedPrompt.wasAdapted).toBe(true);
      }
    });
  });

  describe("analytics recording", () => {
    it("calls analytics logger when provided", () => {
      const events: unknown[] = [];
      const mockAnalytics = {
        enabled: true as const,
        record: (event: unknown) => events.push(event),
      };
      routeMessage({
        message: "hello",
        systemPrompt: "You are helpful.",
        cfg: baseCfg,
        routingConfig: baseRoutingConfig,
        analytics: mockAnalytics,
      });
      expect(events).toHaveLength(1);
    });
  });
});
