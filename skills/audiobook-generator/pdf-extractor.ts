/**
 * PDF Text Extraction Module
 * Uses pdfjs-dist to extract text from PDF documents
 */

import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfExtractionResult {
  text: string;
  numPages: number;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
  };
}

/**
 * Extract text from a PDF file
 * @param pdfPath - Path to the PDF file
 * @param options - Extraction options
 * @returns Extracted text and metadata
 */
export async function extractTextFromPdf(
  pdfPath: string,
  options?: {
    maxPages?: number;
    startPage?: number;
    endPage?: number;
  },
): Promise<PdfExtractionResult> {
  try {
    // Read PDF file
    const pdfBuffer = await readFile(pdfPath);
    const data = new Uint8Array(pdfBuffer);

    // Load PDF document
    const loadingTask = getDocument({
      data,
      useSystemFonts: true,
      standardFontDataUrl: undefined, // Don't load fonts we don't need
    });

    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;

    // Determine page range
    const startPage = options?.startPage ?? 1;
    const endPage = options?.endPage ?? (options?.maxPages ? Math.min(startPage + options.maxPages - 1, numPages) : numPages);

    // Extract metadata
    const metadata = await pdfDocument.getMetadata();
    const extractedMetadata = {
      title: metadata.info?.Title,
      author: metadata.info?.Author,
      subject: metadata.info?.Subject,
      creator: metadata.info?.Creator,
      producer: metadata.info?.Producer,
      creationDate: metadata.info?.CreationDate,
    };

    // Extract text from each page
    const textParts: string[] = [];

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      try {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Combine text items with proper spacing
        const pageText = textContent.items
          .map((item: any) => {
            if ("str" in item) {
              return item.str;
            }
            return "";
          })
          .join(" ");

        textParts.push(pageText);
        textParts.push("\n\n"); // Page break
      } catch (pageError) {
        console.error(`Error extracting text from page ${pageNum}:`, pageError);
        // Continue with next page
      }
    }

    // Cleanup
    await pdfDocument.cleanup();
    await pdfDocument.destroy();

    const fullText = textParts.join("");

    return {
      text: fullText,
      numPages,
      metadata: extractedMetadata,
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to extract text from PDF: ${err.message}`);
  }
}

/**
 * Extract text from a specific page range
 */
export async function extractTextFromPdfPages(
  pdfPath: string,
  startPage: number,
  endPage: number,
): Promise<string> {
  const result = await extractTextFromPdf(pdfPath, { startPage, endPage });
  return result.text;
}

/**
 * Get PDF metadata without extracting all text
 */
export async function getPdfMetadata(pdfPath: string): Promise<PdfExtractionResult["metadata"]> {
  try {
    const pdfBuffer = await readFile(pdfPath);
    const data = new Uint8Array(pdfBuffer);

    const loadingTask = getDocument({ data, useSystemFonts: true });
    const pdfDocument = await loadingTask.promise;
    const metadata = await pdfDocument.getMetadata();

    await pdfDocument.cleanup();
    await pdfDocument.destroy();

    return {
      title: metadata.info?.Title,
      author: metadata.info?.Author,
      subject: metadata.info?.Subject,
      creator: metadata.info?.Creator,
      producer: metadata.info?.Producer,
      creationDate: metadata.info?.CreationDate,
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to get PDF metadata: ${err.message}`);
  }
}

/**
 * Get page count from PDF
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const pdfBuffer = await readFile(pdfPath);
    const data = new Uint8Array(pdfBuffer);

    const loadingTask = getDocument({ data, useSystemFonts: true });
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;

    await pdfDocument.cleanup();
    await pdfDocument.destroy();

    return numPages;
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to get PDF page count: ${err.message}`);
  }
}
