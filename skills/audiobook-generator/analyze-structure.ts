#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";
import { extractTextFromPdf } from "./pdf-extractor.js";

async function main() {
  const pdfPath = join(homedir(), "Downloads", "Databricks Big Book Of GenAI FINAL.pdf");

  console.log("📊 Analyzing PDF Structure...\n");

  const result = await extractTextFromPdf(pdfPath, { startPage: 1, endPage: 10 });
  const lines = result.text.split("\n");

  // Look for patterns that might indicate sections/chapters
  console.log("Looking for potential section headings (first 200 non-empty lines):\n");

  let count = 0;
  for (let i = 0; i < lines.length && count < 200; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    // Check for various patterns
    const isAllCaps = line.toUpperCase() === line && line.length > 5;
    const startsWithNumber = /^\d+[\.:)]/.test(line);
    const hasStage = /stage\s+\d+/i.test(line);
    const isShort = line.length < 100;

    if ((isAllCaps || startsWithNumber || hasStage) && isShort) {
      console.log(`[${i}] ${line}`);
    }
    count++;
  }

  console.log("\n\nFirst 50 lines of content:");
  lines.slice(0, 50).forEach((line, idx) => {
    if (line.trim()) {
      console.log(`[${idx}] ${line}`);
    }
  });
}

main();
