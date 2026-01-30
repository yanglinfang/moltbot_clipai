#!/usr/bin/env node --import tsx

/**
 * Test Script: PDF Text Extraction
 * Tests the PDF extraction functionality with the Databricks GenAI book
 */

import { extractTextFromPdf, getPdfMetadata, getPdfPageCount } from "./pdf-extractor.js";
import { homedir } from "node:os";
import { join } from "node:path";

async function main() {
  const pdfPath = join(homedir(), "Downloads", "Databricks Big Book Of GenAI FINAL.pdf");

  console.log("🧪 PDF Extraction Test\n");
  console.log(`📄 PDF File: ${pdfPath}\n`);

  try {
    // Test 1: Get PDF metadata
    console.log("**Test 1: PDF Metadata**");
    const metadata = await getPdfMetadata(pdfPath);
    console.log("  Title:", metadata?.title || "N/A");
    console.log("  Author:", metadata?.author || "N/A");
    console.log("  Subject:", metadata?.subject || "N/A");
    console.log("  Creator:", metadata?.creator || "N/A");
    console.log("");

    // Test 2: Get page count
    console.log("**Test 2: Page Count**");
    const pageCount = await getPdfPageCount(pdfPath);
    console.log(`  Total Pages: ${pageCount}`);
    console.log("");

    // Test 3: Extract first 3 pages
    console.log("**Test 3: Extract First 3 Pages**");
    const firstPages = await extractTextFromPdf(pdfPath, {
      startPage: 1,
      endPage: 3,
    });
    console.log(`  Extracted Characters: ${firstPages.text.length}`);
    console.log(`  Preview (first 500 chars):`);
    console.log(`  ${firstPages.text.substring(0, 500).replace(/\n/g, "\n  ")}...`);
    console.log("");

    // Test 4: Extract full document (this will take a while for 118 pages)
    console.log("**Test 4: Extract Full Document**");
    console.log("  (This may take 30-60 seconds for 118 pages...)");
    const startTime = Date.now();
    const fullText = await extractTextFromPdf(pdfPath);
    const duration = Date.now() - startTime;

    console.log(`  ✅ Extraction complete in ${(duration / 1000).toFixed(2)}s`);
    console.log(`  Total Characters: ${fullText.text.length}`);
    console.log(`  Total Pages: ${fullText.numPages}`);
    console.log("");

    // Test 5: Chapter detection preview
    console.log("**Test 5: Chapter Detection Preview**");
    const lines = fullText.text.split("\n");
    const chapterPattern = /^(Chapter|CHAPTER)\s+(\d+|[IVX]+)[\s:.]+(.*?)$/i;
    const detectedChapters = lines.filter((line) => chapterPattern.test(line.trim()));

    console.log(`  Potential Chapters Detected: ${detectedChapters.length}`);
    if (detectedChapters.length > 0) {
      console.log("  Sample chapters:");
      detectedChapters.slice(0, 5).forEach((chapter, idx) => {
        console.log(`    ${idx + 1}. ${chapter.trim()}`);
      });
    }
    console.log("");

    console.log("✨ **All tests passed!**\n");
    console.log("Next steps:");
    console.log("  1. Review the extracted text quality");
    console.log("  2. Test TTS generation with a small sample");
    console.log("  3. Run the full audiobook generation pipeline");
  } catch (error) {
    const err = error as Error;
    console.error("❌ Error:", err.message);
    console.error("\nStack trace:");
    console.error(err.stack);
    process.exit(1);
  }
}

main();
