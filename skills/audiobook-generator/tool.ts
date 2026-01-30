import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../src/agents/tools/common.js";
import { readStringParam, readBoolParam } from "../../src/agents/tools/common.js";
import { loadConfig } from "../../src/config/config.js";
import { textToSpeech } from "../../src/tts/tts.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const AudiobookGeneratorSchema = Type.Object({
  pdf: Type.String({ description: "Path to the PDF file to convert to audiobook" }),
  outputDir: Type.Optional(
    Type.String({ description: "Output directory for audio files (default: ~/audiobooks)" }),
  ),
  voice: Type.Optional(Type.String({ description: "TTS voice to use" })),
  provider: Type.Optional(
    Type.String({ description: "TTS provider: edge, openai, or elevenlabs" }),
  ),
  chapters: Type.Optional(
    Type.String({ description: "Comma-separated chapter numbers to generate (e.g., '1,2,3')" }),
  ),
  uploadYoutube: Type.Optional(
    Type.Boolean({ description: "Whether to upload to YouTube after generation" }),
  ),
  youtubePlaylist: Type.Optional(Type.String({ description: "YouTube playlist ID" })),
  maxChunkChars: Type.Optional(
    Type.Number({ description: "Maximum characters per TTS chunk (default: 1500)" }),
  ),
});

interface Chapter {
  number: number;
  title: string;
  startPage: number;
  endPage?: number;
  text: string;
}

interface AudiobookMetadata {
  title: string;
  author?: string;
  totalPages: number;
  totalChapters: number;
  generatedAt: string;
  ttsProvider: string;
  ttsVoice: string;
}

export function createAudiobookGeneratorTool(): AnyAgentTool {
  return {
    label: "Audiobook Generator",
    name: "audiobook-generate",
    description:
      "Convert PDF documents into audiobooks with TTS generation and optional YouTube upload. " +
      "Extracts text, detects chapters, generates speech, and concatenates audio files.",
    parameters: AudiobookGeneratorSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const pdfPath = readStringParam(params, "pdf", { required: true });
      const outputDir = readStringParam(params, "outputDir") ?? join(homedir(), "audiobooks");
      const voice = readStringParam(params, "voice");
      const provider = readStringParam(params, "provider");
      const chaptersStr = readStringParam(params, "chapters");
      const uploadYoutube = readBoolParam(params, "uploadYoutube") ?? false;
      const youtubePlaylist = readStringParam(params, "youtubePlaylist");
      const maxChunkChars = (params.maxChunkChars as number | undefined) ?? 1500;

      const cfg = loadConfig();
      const results: string[] = [];

      try {
        // Step 1: Validate inputs
        results.push("🎙️ **Audiobook Generator Pipeline**\n");
        results.push(`📄 **PDF**: ${pdfPath}`);

        const resolvedPdfPath = resolvePath(pdfPath);
        if (!existsSync(resolvedPdfPath)) {
          throw new Error(`PDF file not found: ${resolvedPdfPath}`);
        }

        // Check for ffmpeg
        try {
          await execAsync("ffmpeg -version");
          results.push("✅ ffmpeg found");
        } catch {
          throw new Error(
            "ffmpeg not found. Install it first:\n" +
              "  macOS: brew install ffmpeg\n" +
              "  Linux: sudo apt-get install ffmpeg",
          );
        }

        //Step 2: Create output directory structure
        const bookName = basename(resolvedPdfPath, ".pdf").replace(/[^a-zA-Z0-9_-]/g, "_");
        const bookDir = join(outputDir, bookName);
        const chaptersDir = join(bookDir, "chapters");
        const youtubeDir = join(bookDir, "youtube");

        mkdirSync(chaptersDir, { recursive: true });
        mkdirSync(youtubeDir, { recursive: true });

        results.push(`📁 **Output Directory**: ${bookDir}`);

        // Step 3: Extract text from PDF
        results.push("\n**Step 1/6: Extracting text from PDF...**");
        const pdfText = await extractPdfText(resolvedPdfPath);
        results.push(`✅ Extracted ${pdfText.length} characters from PDF`);

        // Step 4: Detect chapters
        results.push("\n**Step 2/6: Detecting chapters...**");
        const chapters = detectChapters(pdfText);
        results.push(`✅ Detected ${chapters.length} chapters`);

        // Filter chapters if specified
        const selectedChapters = chaptersStr
          ? chapters.filter((ch) =>
              chaptersStr
                .split(",")
                .map((n) => parseInt(n.trim()))
                .includes(ch.number),
            )
          : chapters;

        results.push(
          `📖 **Processing Chapters**: ${selectedChapters.map((ch) => ch.number).join(", ")}`,
        );

        // Step 5: Process and clean text for each chapter
        results.push("\n**Step 3/6: Processing text...**");
        for (const chapter of selectedChapters) {
          chapter.text = processTextForTts(chapter.text);
          results.push(`✅ Chapter ${chapter.number}: ${chapter.title} (${chapter.text.length} chars)`);
        }

        // Save metadata
        const metadata: AudiobookMetadata = {
          title: bookName,
          totalPages: 0, // Would need PDF library to get actual count
          totalChapters: chapters.length,
          generatedAt: new Date().toISOString(),
          ttsProvider: provider ?? cfg.messages?.tts?.provider ?? "edge",
          ttsVoice: voice ?? cfg.messages?.tts?.edge?.voice ?? "en-US-MichelleNeural",
        };
        writeFileSync(join(bookDir, "metadata.json"), JSON.stringify(metadata, null, 2));

        // Step 6: Generate TTS for each chapter
        results.push("\n**Step 4/6: Generating speech (this may take a while)...**");
        const audioFiles: string[] = [];

        for (const chapter of selectedChapters) {
          results.push(`\n🎤 **Chapter ${chapter.number}**: ${chapter.title}`);

          // Split chapter into chunks for TTS
          const chunks = splitIntoChunks(chapter.text, maxChunkChars);
          results.push(`  📝 Split into ${chunks.length} chunks`);

          const chapterAudioChunks: string[] = [];

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            results.push(`  🔊 Generating chunk ${i + 1}/${chunks.length}...`);

            const ttsResult = await textToSpeech({
              text: chunk,
              cfg,
              channel: undefined,
            });

            if (!ttsResult.success || !ttsResult.audioPath) {
              throw new Error(
                `TTS generation failed for chapter ${chapter.number}, chunk ${i + 1}: ${ttsResult.error}`,
              );
            }

            chapterAudioChunks.push(ttsResult.audioPath);
            results.push(`  ✅ Chunk ${i + 1} generated (${ttsResult.provider})`);
          }

          // Concatenate chunks into chapter audio
          const chapterAudioPath = join(chaptersDir, `chapter_${String(chapter.number).padStart(2, "0")}.mp3`);
          await concatenateAudioFiles(chapterAudioChunks, chapterAudioPath);
          audioFiles.push(chapterAudioPath);

          results.push(`✅ **Chapter ${chapter.number} complete**: ${chapterAudioPath}`);
        }

        // Step 7: Concatenate all chapters into full audiobook
        results.push("\n**Step 5/6: Creating full audiobook...**");
        const fullAudiobookPath = join(bookDir, "full_audiobook.mp3");
        await concatenateAudioFiles(audioFiles, fullAudiobookPath);
        results.push(`✅ **Full audiobook created**: ${fullAudiobookPath}`);

        // Step 8: YouTube upload (if requested)
        if (uploadYoutube) {
          results.push("\n**Step 6/6: Uploading to YouTube...**");
          results.push(
            "⚠️  YouTube upload requires manual browser automation or API setup.",
          );
          results.push(
            "📺 **Instructions**: Upload the files in the `youtube/` directory manually to YouTube Studio.",
          );
          results.push(`   URL: https://studio.youtube.com/`);

          if (youtubePlaylist) {
            results.push(`   Playlist: ${youtubePlaylist}`);
          }
        }

        // Final summary
        results.push("\n---\n");
        results.push("✨ **Audiobook Generation Complete!**\n");
        results.push(`📂 **Output Directory**: ${bookDir}`);
        results.push(`🎵 **Chapters Generated**: ${selectedChapters.length}`);
        results.push(`📊 **Total Audio Files**: ${audioFiles.length}`);
        results.push(`🎧 **Full Audiobook**: ${fullAudiobookPath}`);

        return {
          content: [{ type: "text", text: results.join("\n") }],
          details: {
            outputDir: bookDir,
            chapters: selectedChapters.length,
            fullAudiobook: fullAudiobookPath,
            metadata,
          },
        };
      } catch (error) {
        const err = error as Error;
        results.push(`\n❌ **Error**: ${err.message}`);

        return {
          content: [{ type: "text", text: results.join("\n") }],
          details: { error: err.message },
        };
      }
    },
  };
}

// Helper functions

function resolvePath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Extract text from PDF using pdfjs-dist
 */
async function extractPdfText(pdfPath: string): Promise<string> {
  const { extractTextFromPdf } = await import("./pdf-extractor.js");
  const result = await extractTextFromPdf(pdfPath);
  return result.text;
}

/**
 * Detect chapters from extracted text using various heuristics
 */
function detectChapters(text: string): Chapter[] {
  const chapters: Chapter[] = [];
  const lines = text.split("\n");

  // Enhanced patterns for detecting chapter/section boundaries
  const patterns = [
    // "Chapter X: Title" or "Chapter X Title"
    /^(Chapter|CHAPTER)\s+(\d+|[IVX]+)[\s:.]+(.*?)$/i,
    // "Stage X: Title"
    /^(Stage|STAGE)\s+(\d+)[\s:.]+(.*?)$/i,
    // "Section X: Title"
    /^(Section|SECTION)\s+(\d+)[\s:.]+(.*?)$/i,
    // "Part X: Title"
    /^(Part|PART)\s+(\d+|[IVX]+)[\s:.]+(.*?)$/i,
    // Numbered sections "1. Title" or "1) Title"
    /^(\d+)[\.)]\s+([A-Z][^.!?]*?)$/,
  ];

  let currentChapter: Chapter | null = null;
  let chapterNumber = 0;
  let collectedText: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip very short lines (likely noise)
    if (line.length < 3) {
      if (currentChapter) {
        collectedText.push(line);
      }
      continue;
    }

    let matched = false;

    // Try each pattern
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        // Save previous chapter
        if (currentChapter) {
          currentChapter.text = collectedText.join("\n");
          chapters.push(currentChapter);
        }

        // Start new chapter
        chapterNumber++;
        const prefix = match[1]; // "Chapter", "Stage", etc.
        const number = match[2]; // Thenum number/roman numeral
        const title = match[3] || match[2] || ""; // The title part

        currentChapter = {
          number: chapterNumber,
          title: title.trim() || `${prefix} ${number}`,
          startPage: 0,
          text: "",
        };

        collectedText = [];
        matched = true;
        break;
      }
    }

    if (!matched && currentChapter) {
      // Add line to current chapter
      collectedText.push(line);
    } else if (!matched && !currentChapter) {
      // Text before first chapter - create an intro chapter
      if (!currentChapter && line.length > 10) {
        currentChapter = {
          number: 1,
          title: "Introduction",
          startPage: 0,
          text: "",
        };
        chapterNumber = 1;
        collectedText = [line];
      }
    }
  }

  // Add last chapter
  if (currentChapter) {
    currentChapter.text = collectedText.join("\n");
    chapters.push(currentChapter);
  }

  // If no chapters detected, treat entire text as one chapter
  if (chapters.length === 0) {
    chapters.push({
      number: 1,
      title: "Full Document",
      startPage: 0,
      text,
    });
  }

  return chapters;
}

/**
 * Process text to make it more suitable for TTS
 */
function processTextForTts(text: string): string {
  let processed = text;

  // Remove multiple consecutive spaces
  processed = processed.replace(/\s+/g, " ");

  // Remove page numbers (simple heuristic)
  processed = processed.replace(/\n\s*\d+\s*\n/g, "\n");

  // Fix hyphenation at line breaks
  processed = processed.replace(/-\n/g, "");

  // Add pauses after sentences
  processed = processed.replace(/([.!?])\s+/g, "$1 ");

  // Remove URLs for better speech
  processed = processed.replace(/https?:\/\/[^\s]+/g, "");

  // Expand common abbreviations
  processed = processed.replace(/\be\.g\./gi, "for example");
  processed = processed.replace(/\bi\.e\./gi, "that is");
  processed = processed.replace(/\betc\./gi, "etcetera");

  return processed.trim();
}

/**
 * Split text into chunks suitable for TTS processing
 */
function splitIntoChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length <= maxChars) {
      currentChunk += sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Concatenate multiple audio files into one using ffmpeg
 */
async function concatenateAudioFiles(inputFiles: string[], outputFile: string): Promise<void> {
  if (inputFiles.length === 0) {
    throw new Error("No input files to concatenate");
  }

  if (inputFiles.length === 1) {
    // Just copy the single file
    const { copyFile } = await import("node:fs/promises");
    await copyFile(inputFiles[0], outputFile);
    return;
  }

  // Create a file list for ffmpeg concat
  const listFile = `${outputFile}.list`;
  const fileList = inputFiles.map((file) => `file '${file}'`).join("\n");
  writeFileSync(listFile, fileList);

  try {
    // Use ffmpeg to concatenate
    const ffmpegCmd = `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}" -y`;
    await execAsync(ffmpegCmd);

    // Clean up list file
    const { unlink } = await import("node:fs/promises");
    await unlink(listFile);
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to concatenate audio files: ${err.message}`);
  }
}
