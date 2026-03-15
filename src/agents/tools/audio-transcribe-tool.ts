import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { readStringParam } from "./common.js";

const execAsync = promisify(exec);

// WhatsApp sends voice notes as audio/ogg;codecs=opus.
// Whisper APIs accept: flac, mp3, mp4, mpeg, mpga, m4a, wav, webm — not ogg.
// We convert ogg → wav via ffmpeg when available.
const OGG_EXTS = new Set([".ogg", ".oga"]);

const AudioTranscribeSchema = Type.Object({
  file_path: Type.String({
    description:
      "Absolute path to the audio file to transcribe (e.g. from an inbound voice note mediaPath).",
  }),
  language: Type.Optional(
    Type.String({
      description: "BCP-47 language code hint, e.g. 'en', 'zh', 'es'. Leave unset for auto-detect.",
    }),
  ),
  prompt: Type.Optional(
    Type.String({
      description:
        "Optional context hint to improve transcription accuracy (e.g. domain vocabulary).",
    }),
  ),
});

type WhisperBackend = {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

/** Resolve available API backend in priority order: Groq → OpenAI. */
function resolveBackend(): WhisperBackend | null {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    return {
      name: "groq",
      apiKey: groqKey,
      baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
      model: "whisper-large-v3",
    };
  }
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      name: "openai",
      apiKey: openaiKey,
      baseUrl: "https://api.openai.com/v1/audio/transcriptions",
      model: "whisper-1",
    };
  }
  return null;
}

/** Convert ogg/opus → wav via ffmpeg (16kHz mono, ideal for speech). */
async function convertOggToWav(inputPath: string): Promise<string> {
  const outPath = path.join(tmpdir(), `moltbot-audio-${Date.now()}.wav`);
  await execAsync(`ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 "${outPath}"`);
  return outPath;
}

/** Check whether ffmpeg is on PATH. */
async function hasFfmpeg(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

/** Send audio file to a Whisper-compatible API endpoint. */
async function transcribeWithApi(params: {
  filePath: string;
  backend: WhisperBackend;
  language?: string;
  prompt?: string;
}): Promise<string> {
  const ext = path.extname(params.filePath).toLowerCase();
  let targetPath = params.filePath;
  let tmpWav: string | null = null;

  // Convert ogg/opus → wav for API compatibility
  if (OGG_EXTS.has(ext) && (await hasFfmpeg())) {
    tmpWav = await convertOggToWav(params.filePath);
    targetPath = tmpWav;
  }

  try {
    const buffer = await fs.readFile(targetPath);
    const filename = path.basename(targetPath);
    const mimeType = targetPath.endsWith(".wav") ? "audio/wav" : "audio/mpeg";

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), filename);
    form.append("model", params.backend.model);
    if (params.language) form.append("language", params.language);
    if (params.prompt) form.append("prompt", params.prompt);

    const response = await fetch(params.backend.baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.backend.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${params.backend.name} API ${response.status}: ${err}`);
    }

    const json = (await response.json()) as { text: string };
    return json.text.trim();
  } finally {
    if (tmpWav) await fs.unlink(tmpWav).catch(() => undefined);
  }
}

export function createAudioTranscribeTool(): AnyAgentTool {
  return {
    label: "Audio Transcribe",
    name: "audio_transcribe",
    description:
      "Transcribe an audio file to text. Use this whenever the user sends a voice note or audio file " +
      "(check the mediaPath field of the inbound message). " +
      "Supports OGG/Opus (WhatsApp voice notes), MP3, WAV, M4A, WebM. " +
      "Backends tried in order: GROQ_API_KEY (free, fast) → OPENAI_API_KEY. " +
      "Always attempt transcription before asking the user to type.",
    parameters: AudioTranscribeSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const filePath = readStringParam(params, "file_path", { required: true });
      const language = readStringParam(params, "language");
      const prompt = readStringParam(params, "prompt");

      // Verify file exists
      try {
        await fs.access(filePath);
      } catch {
        return {
          content: [{ type: "text", text: `Audio file not found: ${filePath}` }],
          details: { error: "file_not_found", filePath },
        };
      }

      const backend = resolveBackend();

      if (!backend) {
        return {
          content: [
            {
              type: "text",
              text:
                "No transcription API key configured. " +
                "Add GROQ_API_KEY (free at console.groq.com) or OPENAI_API_KEY to .env and restart the gateway.",
            },
          ],
          details: { error: "no_api_key" },
        };
      }

      try {
        const text = await transcribeWithApi({ filePath, backend, language, prompt });
        return {
          content: [{ type: "text", text }],
          details: { backend: backend.name, model: backend.model, filePath, language },
        };
      } catch (err) {
        const errMsg = String(err);
        return {
          content: [
            {
              type: "text",
              text: `Transcription failed (${backend.name}): ${errMsg}`,
            },
          ],
          details: { error: "transcription_failed", backend: backend.name, message: errMsg },
        };
      }
    },
  };
}
