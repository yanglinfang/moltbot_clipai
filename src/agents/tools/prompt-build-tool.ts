import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { readStringParam } from "./common.js";

const PromptBuildSchema = Type.Object({
  raw_text: Type.String({
    description:
      "Raw or unstructured text to clean and structure into a prompt. " +
      "Typically speech-to-text output from a voice note, rough notes, or a stream-of-consciousness request.",
  }),
  intent: Type.Optional(
    Type.String({
      description:
        "One-line summary of the overall goal (e.g. 'Schedule a meeting', 'Summarize my emails'). " +
        "If omitted, it is inferred from raw_text.",
    }),
  ),
  context: Type.Optional(
    Type.String({
      description:
        "Background context to include (e.g. 'Working on project X', 'I'm a software engineer').",
    }),
  ),
  output_format: Type.Optional(
    Type.String({
      description:
        "Desired output format for the response (e.g. 'bullet list', 'one paragraph', 'JSON').",
    }),
  ),
});

// Common speech filler patterns — removed while preserving sentence flow
const FILLER_PATTERNS: RegExp[] = [
  /\b(um+|uh+|hmm+|hm+)\b,?\s*/gi,
  /\b(like,?\s+){2,}/gi, // repeated "like like like"
  /\byou know\b,?\s*/gi,
  /\bbasically\b,?\s*/gi,
  /\bliterally\b,?\s*/gi,
  /\bactually\b,?\s*/gi,
  /\bessentially\b,?\s*/gi,
  /\bsort of\b,?\s*/gi,
  /\bkind of\b,?\s*/gi,
  /\bright\?\s*/gi,
  /\byeah,?\s*/gi,
  /\bokay so\b,?\s*/gi,
];

function cleanSpeechText(raw: string): string {
  let text = raw;

  for (const pattern of FILLER_PATTERNS) {
    text = text.replace(pattern, " ");
  }

  // Collapse multiple spaces/newlines
  text = text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Ensure sentences start with a capital letter
  text = text.replace(/(^|[.!?]\s+)([a-z])/g, (_, pre, char) => pre + char.toUpperCase());

  // Add a period at the end if no terminal punctuation
  if (text && !/[.!?]$/.test(text)) {
    text += ".";
  }

  return text;
}

/** Infer a short intent line from raw text (first sentence or first 80 chars). */
function inferIntent(text: string): string {
  const firstSentence = text.split(/[.!?]/)[0]?.trim() ?? text;
  if (firstSentence.length <= 80) return firstSentence;
  return `${firstSentence.slice(0, 77)}...`;
}

function buildPrompt(params: {
  cleaned: string;
  intent?: string;
  context?: string;
  outputFormat?: string;
}): string {
  const sections: string[] = [];

  const intent = params.intent?.trim() || inferIntent(params.cleaned);
  sections.push(`**Goal:** ${intent}`);

  if (params.context?.trim()) {
    sections.push(`**Context:** ${params.context.trim()}`);
  }

  sections.push(`**Request:**\n${params.cleaned}`);

  if (params.outputFormat?.trim()) {
    sections.push(`**Output format:** ${params.outputFormat.trim()}`);
  }

  return sections.join("\n\n");
}

export function createPromptBuildTool(): AnyAgentTool {
  return {
    label: "Prompt Builder",
    name: "prompt_build",
    description:
      "Clean and structure raw or messy text (e.g. speech-to-text output from a voice note, rough notes) " +
      "into a clear, well-structured prompt. Removes speech fillers (um, uh, like, you know...), " +
      "fixes sentence casing, and organises the content into Goal / Context / Request sections. " +
      "Use after audio_transcribe to turn a raw transcription into an actionable request.",
    parameters: PromptBuildSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const rawText = readStringParam(params, "raw_text", { required: true });
      const intent = readStringParam(params, "intent");
      const context = readStringParam(params, "context");
      const outputFormat = readStringParam(params, "output_format");

      const cleaned = cleanSpeechText(rawText);
      const prompt = buildPrompt({ cleaned, intent, context, outputFormat });

      return {
        content: [{ type: "text", text: prompt }],
        details: {
          originalLength: rawText.length,
          cleanedLength: cleaned.length,
          hasIntent: !!intent,
          hasContext: !!context,
        },
      };
    },
  };
}
