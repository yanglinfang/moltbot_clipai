import { describe, it, expect } from "vitest";
import { adaptPromptForTier } from "./prompt-adapter.js";

const SAMPLE_SYSTEM_PROMPT = `# SOUL.md - Who You Are

## Core Truths
Be genuinely helpful, not performatively helpful.
Have opinions. Be resourceful before asking.

## MLE Interview Coach Role
Lin is preparing for a Google MLE interview.
Coaching style: Direct, no-BS, technically sharp.

## Tools
You have access to bash, file reading, web search.
Use tools when needed.

## Memory
You wake up fresh each session. These files are your continuity.
Don't ask permission. Just do it.

## Heartbeats
When you receive a heartbeat poll, check things proactively.

## Group Chats
In group chats, be smart about when to contribute.

## React Like a Human
On platforms that support reactions, use emoji reactions naturally.

## Vibe
Be the assistant you'd actually want to talk to.`;

describe("prompt-adapter", () => {
  describe("adaptPromptForTier — t0", () => {
    it("returns null system prompt for t0", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t0");
      expect(result.systemPrompt).toBeNull();
      expect(result.tier).toBe("t0");
      expect(result.wasAdapted).toBe(true);
    });
  });

  describe("adaptPromptForTier — t1", () => {
    it("strips tool instructions", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t1");
      expect(result.systemPrompt).not.toBeNull();
      expect(result.systemPrompt!).not.toContain("## Tools");
      expect(result.tier).toBe("t1");
      expect(result.wasAdapted).toBe(true);
    });

    it("strips heartbeat instructions", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t1");
      expect(result.systemPrompt!).not.toContain("## Heartbeats");
    });

    it("strips group chat instructions", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t1");
      expect(result.systemPrompt!).not.toContain("## Group Chats");
    });

    it("strips reaction instructions", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t1");
      expect(result.systemPrompt!).not.toContain("## React Like");
    });

    it("strips boilerplate phrases", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t1");
      expect(result.systemPrompt!).not.toContain("Don't ask permission. Just do it.");
    });

    it("preserves core persona sections", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t1");
      expect(result.systemPrompt!).toContain("Core Truths");
      expect(result.systemPrompt!).toContain("genuinely helpful");
    });

    it("adds format constraints for small models", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t1");
      expect(result.systemPrompt!).toContain("Reply directly and concisely");
      expect(result.systemPrompt!).toContain("under 200 words");
    });

    it("does not have triple+ blank lines", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t1");
      expect(result.systemPrompt!).not.toMatch(/\n{3,}/);
    });
  });

  describe("adaptPromptForTier — t2", () => {
    it("keeps most content intact", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t2");
      // T2 only strips boilerplate phrases, not full sections
      expect(result.systemPrompt!).toContain("Core Truths");
      expect(result.systemPrompt!).toContain("MLE Interview Coach");
      expect(result.tier).toBe("t2");
    });

    it("strips boilerplate phrases", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t2");
      expect(result.systemPrompt!).not.toContain("Don't ask permission. Just do it.");
    });
  });

  describe("adaptPromptForTier — t3", () => {
    it("returns prompt unchanged", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t3");
      expect(result.systemPrompt).toBe(SAMPLE_SYSTEM_PROMPT);
      expect(result.wasAdapted).toBe(false);
      expect(result.userPreamble).toBeNull();
    });
  });

  describe("adaptPromptForTier — t4", () => {
    it("returns full prompt with reasoning preamble", () => {
      const result = adaptPromptForTier(SAMPLE_SYSTEM_PROMPT, "t4");
      expect(result.systemPrompt).toBe(SAMPLE_SYSTEM_PROMPT);
      expect(result.userPreamble).toBeTruthy();
      expect(result.userPreamble!).toContain("Think carefully");
      expect(result.wasAdapted).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles empty system prompt", () => {
      const result = adaptPromptForTier("", "t1");
      expect(result.systemPrompt).not.toBeNull();
      expect(result.tier).toBe("t1");
    });

    it("handles prompt without markdown headers", () => {
      const result = adaptPromptForTier("You are a helpful assistant.", "t1");
      expect(result.systemPrompt).toBeTruthy();
    });
  });
});
