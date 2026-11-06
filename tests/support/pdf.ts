import { PDFDocument, PDFName, PDFString } from "pdf-lib";

/** A real, readable PDF with the given number of pages (the minimal fixtures are rejected by the inspector). */
export async function makePdf(pages = 20, opts: { javascript?: boolean } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 50, y: 780 });
  if (opts.javascript) {
    const action = doc.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("app.alert('hi')") });
    doc.catalog.set(PDFName.of("OpenAction"), doc.context.register(action));
  }
  return Buffer.from(await doc.save());
}
