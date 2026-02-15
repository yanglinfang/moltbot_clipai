import { describe, it, expect } from "vitest";
import {
  getTierDefinition,
  getAllTierDefinitions,
  resolveMinTierForIntent,
  getDefaultTierModel,
  tierIndex,
  isHigherTier,
  maxTier,
  clampTier,
  TIER_ORDER,
} from "./model-tiers.js";

describe("model-tiers", () => {
  describe("getTierDefinition", () => {
    it("returns definition for each tier", () => {
      for (const id of TIER_ORDER) {
        const def = getTierDefinition(id);
        expect(def.id).toBe(id);
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
      }
    });

    it("t0 has zero capabilities", () => {
      const t0 = getTierDefinition("t0");
      expect(t0.capabilities.instructionFollowing).toBe(0);
      expect(t0.capabilities.reasoning).toBe(0);
      expect(t0.costPer1kInput).toBe(0);
      expect(t0.requiresNetwork).toBe(false);
    });

    it("t1 is local and free", () => {
      const t1 = getTierDefinition("t1");
      expect(t1.costPer1kInput).toBe(0);
      expect(t1.requiresNetwork).toBe(false);
    });

    it("t2+ require network", () => {
      expect(getTierDefinition("t2").requiresNetwork).toBe(true);
      expect(getTierDefinition("t3").requiresNetwork).toBe(true);
      expect(getTierDefinition("t4").requiresNetwork).toBe(true);
    });

    it("capabilities increase monotonically from t1 to t4", () => {
      const t1 = getTierDefinition("t1");
      const t2 = getTierDefinition("t2");
      const t3 = getTierDefinition("t3");
      const t4 = getTierDefinition("t4");
      expect(t2.capabilities.reasoning).toBeGreaterThan(t1.capabilities.reasoning);
      expect(t3.capabilities.reasoning).toBeGreaterThan(t2.capabilities.reasoning);
      expect(t4.capabilities.reasoning).toBeGreaterThanOrEqual(t3.capabilities.reasoning);
    });
  });

  describe("getAllTierDefinitions", () => {
    it("returns all 5 tiers in order", () => {
      const defs = getAllTierDefinitions();
      expect(defs).toHaveLength(5);
      expect(defs.map((d) => d.id)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    });
  });

  describe("resolveMinTierForIntent", () => {
    it("maps trivial to t0", () => {
      expect(resolveMinTierForIntent("trivial")).toBe("t0");
    });

    it("maps simple to t1", () => {
      expect(resolveMinTierForIntent("simple")).toBe("t1");
    });

    it("maps standard to t2", () => {
      expect(resolveMinTierForIntent("standard")).toBe("t2");
    });

    it("maps complex to t3", () => {
      expect(resolveMinTierForIntent("complex")).toBe("t3");
    });

    it("maps flagship to t4", () => {
      expect(resolveMinTierForIntent("flagship")).toBe("t4");
    });

    it("maps explicit to t4", () => {
      expect(resolveMinTierForIntent("explicit")).toBe("t4");
    });
  });

  describe("getDefaultTierModel", () => {
    it("returns null for t0", () => {
      expect(getDefaultTierModel("t0")).toBeNull();
    });

    it("returns ollama model for t1", () => {
      const model = getDefaultTierModel("t1");
      expect(model).not.toBeNull();
      expect(model!.provider).toBe("ollama");
    });

    it("returns anthropic model for t2+", () => {
      expect(getDefaultTierModel("t2")!.provider).toBe("anthropic");
      expect(getDefaultTierModel("t3")!.provider).toBe("anthropic");
      expect(getDefaultTierModel("t4")!.provider).toBe("anthropic");
    });
  });

  describe("tier comparison utilities", () => {
    it("tierIndex returns correct indices", () => {
      expect(tierIndex("t0")).toBe(0);
      expect(tierIndex("t1")).toBe(1);
      expect(tierIndex("t2")).toBe(2);
      expect(tierIndex("t3")).toBe(3);
      expect(tierIndex("t4")).toBe(4);
    });

    it("isHigherTier compares correctly", () => {
      expect(isHigherTier("t4", "t0")).toBe(true);
      expect(isHigherTier("t2", "t3")).toBe(false);
      expect(isHigherTier("t1", "t1")).toBe(false);
    });

    it("maxTier returns the higher tier", () => {
      expect(maxTier("t1", "t3")).toBe("t3");
      expect(maxTier("t4", "t2")).toBe("t4");
      expect(maxTier("t2", "t2")).toBe("t2");
    });

    it("clampTier limits tier to max allowed", () => {
      expect(clampTier("t4", "t2")).toBe("t2");
      expect(clampTier("t1", "t3")).toBe("t1");
      expect(clampTier("t2", "t2")).toBe("t2");
    });
  });
});
