#!/usr/bin/env node

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const execAsync = promisify(exec);

async function testInterviewPrep() {
  console.log("🎬 Starting interview-prep end-to-end test...\n");

  // Test text
  const text = "hi this is a test";
  const phone = "+18014485561";

  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputDir = join(homedir(), "interview-prep-test", timestamp);
  mkdirSync(outputDir, { recursive: true });
  console.log(`📁 Output directory: ${outputDir}\n`);

  // Step 1: Save text to file
  const textPath = join(outputDir, "test-content.txt");
  writeFileSync(textPath, text, "utf-8");
  console.log("✅ Step 1: Text saved to", textPath);

  // Step 2: Generate audio using macOS say command (fallback for testing)
  console.log("🎙️  Step 2: Generating audio...");
  const audioPath = join(outputDir, "test-audio.aiff");
  const mp3Path = join(outputDir, "test-audio.mp3");

  try {
    // Use macOS 'say' command to generate audio
    await execAsync(`say -o "${audioPath}" "${text}"`);
    console.log("✅ Audio generated (AIFF format)");

    // Convert AIFF to MP3 using ffmpeg
    await execAsync(`ffmpeg -i "${audioPath}" -acodec libmp3lame -y "${mp3Path}" 2>/dev/null`);
    console.log("✅ Converted to MP3");
  } catch (error) {
    console.error("❌ Audio generation failed:", error.message);
    console.log("\n💡 Trying alternate method (ffmpeg sine wave)...");

    // Fallback: Generate a simple tone with ffmpeg
    await execAsync(`ffmpeg -f lavfi -i "sine=frequency=440:duration=2" -y "${mp3Path}" 2>/dev/null`);
    console.log("✅ Generated test tone audio");
  }

  // Step 3: Convert MP3 to MP4
  console.log("🎬 Step 3: Converting to MP4...");
  const mp4Path = join(outputDir, "interview-prep.mp4");

  try {
    const ffmpegCmd = `ffmpeg -f lavfi -i "color=c=black:s=1280x720" -i "${mp3Path}" -shortest -c:v libx264 -c:a aac -pix_fmt yuv420p -y "${mp4Path}" 2>/dev/null`;
    await execAsync(ffmpegCmd);
    console.log("✅ MP4 generated successfully!");
  } catch (error) {
    console.error("❌ MP4 conversion failed:", error.message);
    return;
  }

  // Results
  console.log("\n" + "=".repeat(60));
  console.log("✨ TEST COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(60));
  console.log("\n📦 Output files:");
  console.log(`   - Text: ${textPath}`);
  console.log(`   - MP3:  ${mp3Path}`);
  console.log(`   - MP4:  ${mp4Path}`);
  console.log(`\n📱 To send to WhatsApp: ${phone}`);
  console.log(`   Run: open "${mp4Path}"`);
  console.log("\n🎉 You can now manually send this MP4 to WhatsApp!");
}

// Run test
testInterviewPrep().catch(console.error);
