import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../src/agents/tools/common.js";
import { readStringParam, readBoolParam, readNumberParam } from "../../src/agents/tools/common.js";
import { extractTextFromPdf } from "../audiobook-generator/pdf-extractor.js";
import { textToSpeech } from "../../src/tts/tts.js";
import { loadConfig } from "../../src/config/config.js";
import { sendMessageWhatsApp } from "../../src/web/outbound.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const InterviewPrepSchema = Type.Object({
	input: Type.String({
		description: "PDF file path or text content to convert to audio",
	}),
	phone: Type.String({
		description: "WhatsApp phone number in E.164 format (e.g., +1234567890)",
	}),
	voice: Type.Optional(
		Type.String({
			description:
				"TTS voice name (e.g., en-US-MichelleNeural for Edge TTS, alloy for OpenAI)",
		}),
	),
	provider: Type.Optional(
		Type.String({
			description:
				"TTS provider: edge (default, free), openai, or elevenlabs",
		}),
	),
	maxLength: Type.Optional(
		Type.Number({
			description:
				"Maximum characters to convert (default: 4000). Use for summaries.",
		}),
	),
	skipWhatsApp: Type.Optional(
		Type.Boolean({
			description: "Skip WhatsApp sending, only generate MP4 (default: false)",
		}),
	),
});

export function createInterviewPrepTool(): AnyAgentTool {
	return {
		label: "Interview Prep Audio",
		name: "interview-prep",
		description:
			"Generate audio summary (MP4) from PDF or text and send to WhatsApp for interview preparation",
		parameters: InterviewPrepSchema,
		execute: async (toolCallId, args) => {
			const params = args as Record<string, unknown>;
			const input = readStringParam(params, "input", { required: true })!;
			const phone = readStringParam(params, "phone", { required: true })!;
			const voice = readStringParam(params, "voice");
			const provider = readStringParam(params, "provider") || "edge";
			const maxLength = readNumberParam(params, "maxLength") || 4000;
			const skipWhatsApp = readBoolParam(params, "skipWhatsApp") ?? false;

			try {
				const cfg = loadConfig();

				// Step 1: Extract text from PDF or use raw text
				let text = "";
				let sourceType = "text";

				if (input.endsWith(".pdf")) {
					sourceType = "pdf";
					const pdfPath = input.startsWith("~/")
						? join(homedir(), input.slice(2))
						: input;

					if (!existsSync(pdfPath)) {
						throw new Error(`PDF file not found: ${pdfPath}`);
					}

					const pdfData = await extractTextFromPdf(pdfPath);
					text = pdfData.text;
				} else if (existsSync(input)) {
					// Check if it's a file path to a text file
					const fs = await import("node:fs/promises");
					text = await fs.readFile(input, "utf-8");
					sourceType = "file";
				} else {
					// Treat as raw text
					text = input;
				}

				// Step 2: Truncate to maxLength if needed
				if (text.length > maxLength) {
					text = text.slice(0, maxLength);
					text += "\n\n[Content truncated to fit maximum length]";
				}

				// Step 3: Clean text for TTS (remove special chars that break TTS)
				text = cleanTextForTts(text);

				// Step 4: Create output directory
				const timestamp = new Date()
					.toISOString()
					.replace(/[:.]/g, "-")
					.slice(0, 19);
				const outputDir = join(homedir(), "interview-prep", timestamp);
				mkdirSync(outputDir, { recursive: true });

				// Save cleaned text
				const textPath = join(outputDir, "content.txt");
				writeFileSync(textPath, text, "utf-8");

				// Step 5: Generate audio
				const ttsResult = await textToSpeech({
					text,
					cfg,
				});

				if (!ttsResult.success || !ttsResult.audioPath) {
					throw new Error(`TTS failed: ${ttsResult.error || "Unknown error"}`);
				}

				const audioPath = ttsResult.audioPath;

				// Step 6: Convert MP3 to MP4 (WhatsApp video format)
				const mp4Path = join(outputDir, "interview-prep.mp4");
				await convertAudioToMp4(audioPath, mp4Path);

				// Step 7: Send to WhatsApp
				let whatsappResult = null;
				if (!skipWhatsApp) {
					whatsappResult = await sendMessageWhatsApp(phone, "📚 Interview prep audio ready!", {
						verbose: true,
						mediaUrl: mp4Path,
					});
				}

				// Step 8: Save metadata
				const metadata = {
					timestamp,
					sourceType,
					input: sourceType === "text" ? "[text content]" : input,
					phone,
					provider: ttsResult.provider || provider,
					voice: voice || "default",
					maxLength,
					textLength: text.length,
					files: {
						text: textPath,
						audio: audioPath,
						mp4: mp4Path,
					},
					whatsapp: whatsappResult,
				};

				writeFileSync(
					join(outputDir, "metadata.json"),
					JSON.stringify(metadata, null, 2),
					"utf-8",
				);

				return {
					content: [
						{
							type: "text",
							text: [
								"✅ Interview prep audio generated!",
								"",
								`📁 Output: ${mp4Path}`,
								`📝 Text: ${text.length} characters`,
								`🎙️ Provider: ${ttsResult.provider || provider}`,
								skipWhatsApp
									? ""
									: `📱 Sent to WhatsApp: ${phone}`,
							]
								.filter(Boolean)
								.join("\n"),
						},
					],
					details: metadata,
				};
			} catch (error) {
				const err = error as Error;
				return {
					content: [{ type: "text", text: `❌ Error: ${err.message}` }],
					details: { error: err.message, stack: err.stack },
				};
			}
		},
	};
}

/**
 * Clean text for TTS (remove/replace problematic characters)
 */
function cleanTextForTts(text: string): string {
	return (
		text
			// Remove multiple spaces
			.replace(/\s+/g, " ")
			// Remove page numbers (e.g., "Page 1 of 10")
			.replace(/Page \d+ of \d+/gi, "")
			// Fix hyphenated line breaks
			.replace(/-\s+/g, "")
			// Remove URLs
			.replace(/https?:\/\/[^\s]+/gi, "")
			// Expand common abbreviations
			.replace(/\be\.g\./gi, "for example")
			.replace(/\bi\.e\./gi, "that is")
			.replace(/\betc\./gi, "et cetera")
			// Sanitize < and > (breaks Edge TTS)
			.replace(/</g, "less than")
			.replace(/>/g, "greater than")
			.trim()
	);
}

/**
 * Convert audio (MP3) to MP4 with static black background
 * This creates a video file that WhatsApp can handle
 * Uses encoding settings compatible with both Mac and Windows
 */
async function convertAudioToMp4(
	audioPath: string,
	outputPath: string,
): Promise<void> {
	// Create MP4 with black background and audio
	// Using shortest filter to match video duration to audio duration
	const ffmpegCmd = [
		"ffmpeg",
		'-f lavfi -i "color=c=black:s=1280x720:r=30"', // Black background 1280x720 at 30fps
		`-i "${audioPath}"`, // Audio input
		"-shortest", // Match shortest stream (audio)
		"-c:v libx264", // H.264 video codec
		"-profile:v baseline", // Baseline profile for maximum compatibility
		"-level 3.0", // Level 3.0 for broad device support
		"-c:a libmp3lame", // MP3 audio codec (Windows native support, no codec needed)
		"-b:a 128k", // Audio bitrate for quality/compatibility
		"-ar 44100", // Standard sample rate
		"-ac 2", // Stereo audio
		"-pix_fmt yuv420p", // Pixel format for compatibility
		"-movflags +faststart", // Move moov atom to start for streaming
		"-y", // Overwrite output
		`"${outputPath}"`,
	].join(" ");

	await execAsync(ffmpegCmd);
}
