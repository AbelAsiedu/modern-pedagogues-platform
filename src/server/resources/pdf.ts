import { PDFDict, PDFDocument, PDFName, PDFStream } from "pdf-lib";

export const MAX_PDF_PAGES = 1000;

export type PdfReport = {
  /** Page count, or 0 if the file could not be read. */
  pages: number;
  /** Reasons the file cannot be accepted. Empty means it passed the automatic checks. */
  problems: string[];
  /** Things a human reviewer should look at but that do not block the upload. */
  notes: string[];
};

/** Keys and action types that let a PDF run code, open programs or hide other files. */
const DANGEROUS_KEYS = ["JS", "JavaScript", "Launch", "SubmitForm", "ImportData", "RichMedia", "EmbeddedFiles", "GoToE", "GoToR"] as const;
const DANGEROUS_ACTIONS = new Set(["JavaScript", "Launch", "SubmitForm", "ImportData", "Rendition", "Movie", "Sound", "GoToE", "GoToR"]);

/**
 * Read a PDF the way a viewer would and report on it. Never executes anything. Encrypted, damaged, or oversized
 * files, and files that carry scripts, launch actions or embedded files, are refused. This is a safeguard, not a
 * malware scanner: a human reviewer opens every file before it is published.
 */
export async function inspectPdf(bytes: Buffer): Promise<PdfReport> {
  const problems: string[] = [];
  const notes: string[] = [];
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: false });
  } catch (err) {
    const encrypted = err instanceof Error && /encrypt/i.test(err.message);
    return { pages: 0, problems: [encrypted ? "The PDF is password-protected or encrypted. Remove the protection and upload it again." : "The PDF could not be read. It may be damaged; export it again from your editor."], notes };
  }
  let pages: number;
  try {
    pages = doc.getPageCount();
  } catch {
    return { pages: 0, problems: ["The PDF could not be read. It may be damaged; export it again from your editor."], notes };
  }
  if (pages === 0) problems.push("The PDF has no pages.");
  if (pages > MAX_PDF_PAGES) problems.push(`The PDF has ${pages} pages; the maximum is ${MAX_PDF_PAGES}.`);

  const flagged = new Set<string>();
  let links = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    for (const k of DANGEROUS_KEYS) if (dict.has(PDFName.of(k))) flagged.add(k);
    const s = dict.get(PDFName.of("S"));
    if (s instanceof PDFName) {
      const action = s.asString().replace(/^\//, "");
      if (DANGEROUS_ACTIONS.has(action)) flagged.add(action);
      if (action === "URI") links++;
    }
    const type = dict.get(PDFName.of("Type"));
    if (type instanceof PDFName && type.asString() === "/EmbeddedFile") flagged.add("EmbeddedFile");
  }
  if (flagged.size > 0) {
    problems.push("The PDF contains scripts, launch actions or embedded files, which are not allowed. Export a plain PDF without interactive content.");
  }
  if (links > 0) notes.push(`The PDF contains ${links} web link${links === 1 ? "" : "s"}. Check where they go.`);
  return { pages, problems, notes };
}
