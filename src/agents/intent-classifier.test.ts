import { describe, it, expect } from "vitest";
import { classifyIntent } from "./intent-classifier.js";

describe("intent-classifier", () => {
  describe("trivial messages", () => {
    it.each([
      ["hi", "trivial"],
      ["hey", "trivial"],
      ["hello!", "trivial"],
      ["ok", "trivial"],
      ["thanks", "trivial"],
      ["yep", "trivial"],
      ["lol", "trivial"],
      ["bye", "trivial"],
      ["yes", "trivial"],
      ["no", "trivial"],
      ["k", "trivial"],
    ])("classifies '%s' as trivial", (message, expected) => {
      const result = classifyIntent(message);
      expect(result.intent).toBe(expected);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it("classifies empty messages as trivial", () => {
      expect(classifyIntent("").intent).toBe("trivial");
      expect(classifyIntent("").confidence).toBe(1.0);
    });

    it("classifies emoji-only messages as trivial", () => {
      expect(classifyIntent("👍").intent).toBe("trivial");
      expect(classifyIntent("🔥💯").intent).toBe("trivial");
    });

    it("classifies very short non-questions as trivial", () => {
      expect(classifyIntent("cool").intent).toBe("trivial");
      expect(classifyIntent("nice").intent).toBe("trivial");
    });
  });

  describe("explicit model requests", () => {
    it.each([
      "/model opus",
      "/model sonnet",
      "/model haiku",
      "use opus for this",
      "switch to sonnet",
    ])("classifies '%s' as explicit", (message) => {
      const result = classifyIntent(message);
      expect(result.intent).toBe("explicit");
      expect(result.confidence).toBe(1.0);
    });
  });

  describe("simple messages", () => {
    it.each(["what is a tensor?", "define overfitting", "what time is it?", "remind me to study"])(
      "classifies '%s' as simple",
      (message) => {
        const result = classifyIntent(message);
        expect(result.intent).toBe("simple");
      },
    );

    it("classifies short questions without complexity as simple", () => {
      const result = classifyIntent("how does SGD work?");
      expect(result.intent).toBe("simple");
    });
  });

  describe("standard messages", () => {
    it("classifies medium-length messages as standard", () => {
      const result = classifyIntent(
        "I'm working on a binary classification problem with imbalanced data. " +
          "What approaches should I consider for handling the class imbalance? " +
          "I've tried oversampling but it's not helping much with the minority class.",
      );
      expect(result.intent).toBe("standard");
    });
  });

  describe("complex messages", () => {
    it("classifies messages with system design keywords as complex", () => {
      // Short messages with a single keyword may not reach the complexity threshold.
      // Adding multiple signals pushes it over.
      const result = classifyIntent(
        "explain how to design a system for real-time recommendations, " +
          "including the trade-offs between collaborative filtering and content-based approaches",
      );
      expect(result.intent).toBe("complex");
    });

    it("classifies messages with code blocks as complex", () => {
      const longCode = "```python\n" + "x = 1\n".repeat(20) + "```";
      const result = classifyIntent(`review this code: ${longCode}`);
      expect(result.intent).toBe("complex");
    });

    it("classifies messages with multiple questions as higher complexity", () => {
      const result = classifyIntent(
        "What are the trade-offs between batch normalization and layer normalization? " +
          "When would you use one over the other? " +
          "How does each affect gradient flow?",
      );
      expect(["complex", "standard"]).toContain(result.intent);
    });

    it("classifies step-by-step requests with enough signals as complex", () => {
      const result = classifyIntent(
        "explain step by step how backpropagation works through an LSTM, " +
          "including the gradient flow through the forget gate and how to debug vanishing gradients",
      );
      expect(result.intent).toBe("complex");
    });
  });

  describe("flagship messages", () => {
    it.each([
      "let's do a mock interview for ML engineer",
      "full system design for a recommendation engine from scratch",
      "I want a comprehensive analysis of transformer attention mechanisms",
      "design a real-time ML pipeline from scratch",
    ])("classifies '%s' as flagship", (message) => {
      const result = classifyIntent(message);
      expect(result.intent).toBe("flagship");
    });
  });

  describe("classification metadata", () => {
    it("returns confidence between 0 and 1", () => {
      const result = classifyIntent("hello");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("returns a non-empty reason", () => {
      const result = classifyIntent("hello");
      expect(result.reason).toBeTruthy();
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it("returns signals array", () => {
      const result = classifyIntent("explain system design step by step");
      expect(Array.isArray(result.signals)).toBe(true);
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it("signals have required fields", () => {
      const result = classifyIntent("explain system design");
      for (const signal of result.signals) {
        expect(signal).toHaveProperty("name");
        expect(signal).toHaveProperty("weight");
        expect(signal).toHaveProperty("matched");
      }
    });
  });
});
