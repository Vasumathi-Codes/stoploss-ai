/**
 * Reads the positioned text layer of a digital PDF, in the browser, so a bank statement can be
 * parsed without the file leaving the device. Uses unpdf (a serverless build of Mozilla's PDF.js),
 * loaded only when needed. Nothing in the PDF is executed: only the text layer is read, so scripts,
 * links and forms are ignored; XFA forms and font loading are off, and this PDF.js build has no eval path.
 *
 * Image-only (scanned) PDFs have no text layer; they come back with `hasText: false`.
 */
import { groupTextItems, type StatementLine } from "./statement-parser"

/** Statements longer than this are cut off; the person is told. */
export const MAX_PDF_PAGES = 20

export async function extractPdfLines(
  data: ArrayBuffer | Uint8Array,
): Promise<{ lines: StatementLine[]; pages: number; truncated: boolean; hasText: boolean }> {
  const { getDocumentProxy } = await import("unpdf")
  // Always a plain copy: PDF.js rejects Buffer subclasses and may detach the input.
  const pdf = await getDocumentProxy(new Uint8Array(data), {
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
  })
  try {
    const pages = Math.min(pdf.numPages, MAX_PDF_PAGES)
    const lines: StatementLine[] = []
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      const items = content.items.flatMap((i) =>
        "str" in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number, width: i.width }] : [],
      )
      lines.push(...groupTextItems(p, items))
    }
    return { lines, pages, truncated: pdf.numPages > MAX_PDF_PAGES, hasText: lines.length > 0 }
  } finally {
    // Releases parsed pages and fonts held in memory.
    await pdf.cleanup()
  }
}
