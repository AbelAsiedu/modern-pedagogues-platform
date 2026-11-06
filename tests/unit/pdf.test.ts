import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { inspectPdf } from "@/server/resources/pdf";

async function make(pages: number, tweak?: (doc: PDFDocument) => void) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  tweak?.(doc);
  return Buffer.from(await doc.save());
}

describe("inspectPdf", () => {
  it("accepts a plain PDF and counts its pages", async () => {
    const r = await inspectPdf(await make(12));
    expect(r).toEqual({ pages: 12, problems: [], notes: [] });
  });

  it("refuses a PDF that carries JavaScript", async () => {
    const buf = await make(3, (doc) => {
      const action = doc.context.obj({ Type: "Action", S: "JavaScript", JS: PDFString.of("app.alert(1)") });
      doc.catalog.set(PDFName.of("OpenAction"), doc.context.register(action));
    });
    const r = await inspectPdf(buf);
    expect(r.pages).toBe(3);
    expect(r.problems.join(" ")).toMatch(/scripts, launch actions or embedded files/);
  });

  it("refuses launch actions", async () => {
    const buf = await make(2, (doc) => {
      const action = doc.context.obj({ Type: "Action", S: "Launch", F: PDFString.of("calc.exe") });
      doc.catalog.set(PDFName.of("OpenAction"), doc.context.register(action));
    });
    expect((await inspectPdf(buf)).problems).toHaveLength(1);
  });

  it("notes web links for the reviewer without blocking them", async () => {
    const buf = await make(2, (doc) => {
      const link = doc.context.obj({ Type: "Action", S: "URI", URI: PDFString.of("https://example.org") });
      doc.context.register(link);
    });
    const r = await inspectPdf(buf);
    expect(r.problems).toEqual([]);
    expect(r.notes[0]).toMatch(/1 web link/);
  });

  it("refuses damaged files that merely start with %PDF-", async () => {
    const r = await inspectPdf(Buffer.from("%PDF-1.7\nthis is not really a pdf\n"));
    expect(r.pages).toBe(0);
    expect(r.problems[0]).toMatch(/could not be read/);
  });
});
