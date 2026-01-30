import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { homedir } from "node:os";
import { join } from "node:path";

const pdfPath = join(homedir(), "Downloads", "Databricks Big Book Of GenAI FINAL.pdf");
const pdfBuffer = await readFile(pdfPath);
const data = new Uint8Array(pdfBuffer);

const loadingTask = getDocument({ data, useSystemFonts: true });
const pdfDocument = await loadingTask.promise;

// Extract first few pages
for (let pageNum = 1; pageNum <= 5; pageNum++) {
  const page = await pdfDocument.getPage(pageNum);
  const textContent = await page.getTextContent();

  console.log(`\n=== PAGE ${pageNum} ===`);
  const pageText = textContent.items
    .map((item) => item.str)
    .join(" ");
  console.log(pageText.substring(0, 1000));
}

await pdfDocument.cleanup();
await pdfDocument.destroy();
