import { describe, expect, it } from "vitest";
import {
  AVERAGE_PASS, CRITERIA, evaluateRubric, listingInput, priceFrom, readiness, type ReadinessInput,
} from "@/server/resources/quality";

const good: ReadinessInput = {
  title: "JHS Integrated Science Complete Course",
  summary: "A complete three-year JHS Integrated Science course with worked examples, practice questions and full answers.",
  description: "x".repeat(320),
  kind: "COURSE",
  subject: "Integrated Science",
  levelKeys: ["jhs"],
  outcomes: ["Explain the structure of a plant cell and its parts", "Carry out and record a simple investigation", "Solve problems on force and motion"],
  audience: "JHS learners preparing for the BECE who know basic maths.",
  tableOfContents: "Unit 1: Living things. Unit 2: Matter. Unit 3: Energy. Unit 4: Earth and space.",
  authorName: "Ama Mensah",
  coverPath: "/media/0194b2c8-1d3a-7c4e-9a52-0f6a1b2c3d4e.jpg",
  cover: { width: 1200, height: 800 },
  file: { pages: 40, problems: [] },
  declared: true,
};

describe("readiness", () => {
  it("passes a complete listing", () => expect(readiness(good)).toEqual([]));

  it("lists every missing requirement in plain words", () => {
    const r = readiness({ ...good, title: "Maths", summary: "short", description: "", subject: "", levelKeys: [], outcomes: ["a"], audience: "", tableOfContents: "", authorName: "", coverPath: null, cover: null, file: null, declared: false });
    expect(r.length).toBeGreaterThanOrEqual(11);
    expect(r.join("\n")).toMatch(/title/);
    expect(r.join("\n")).toMatch(/Upload the PDF/);
    expect(r.join("\n")).toMatch(/declarations/);
  });

  it("applies a minimum length per kind and refuses PDFs with problems", () => {
    expect(readiness({ ...good, file: { pages: 5, problems: [] } }).join()).toMatch(/needs at least 15 pages/);
    expect(readiness({ ...good, kind: "WORKSHEET", tableOfContents: "", file: { pages: 5, problems: [] } })).toEqual([]);
    expect(readiness({ ...good, file: { pages: 40, problems: ["The PDF is password-protected"] } })).toEqual(["The PDF is password-protected"]);
  });

  it("wants a cover big enough to look professional", () => {
    expect(readiness({ ...good, cover: { width: 300, height: 200 } }).join()).toMatch(/at least 600×400/);
  });
});

describe("listing input", () => {
  const base = { title: "Maths revision", summary: "s", kind: "BOOK", outcomes: "Add fractions correctly\nSubtract fractions correctly\n\nMultiply fractions", levelKeys: ["jhs"] };

  it("splits outcomes by line and removes duplicates", () => {
    const r = listingInput.parse({ ...base, outcomes: "One outcome here\nOne outcome here\nAnother outcome" });
    expect(r.outcomes).toEqual(["One outcome here", "Another outcome"]);
  });

  it("keeps contact details and links out of every public field", () => {
    for (const field of ["title", "summary", "description", "authorName", "audience", "tableOfContents", "subject"]) {
      for (const bad of ["email me at a@b.com", "see https://x.example", "call 0244 000 111"]) {
        expect(listingInput.safeParse({ ...base, [field]: bad }).success, `${field}: ${bad}`).toBe(false);
      }
    }
    expect(listingInput.safeParse({ ...base, outcomes: "Visit www.example.com for more" }).success).toBe(false);
  });

  it("only accepts a cover from the media library and a known kind", () => {
    expect(listingInput.safeParse({ ...base, coverPath: "https://evil.example/a.jpg" }).success).toBe(false);
    expect(listingInput.safeParse({ ...base, kind: "MOVIE" }).success).toBe(false);
  });
});

describe("price", () => {
  it("is zero for free resources whatever is typed", () => expect(priceFrom({ isFree: true, price: "99" }, true)).toEqual({ ok: true, pesewas: 0n }));
  it("holds creators to GH₵ 5 to 5,000 and staff to GH₵ 1 to 5,000", () => {
    expect(priceFrom({ isFree: false, price: "4.99" }, true).ok).toBe(false);
    expect(priceFrom({ isFree: false, price: "5" }, true)).toEqual({ ok: true, pesewas: 500n });
    expect(priceFrom({ isFree: false, price: "1" }, false)).toEqual({ ok: true, pesewas: 100n });
    for (const price of ["", "abc", "5000.01", "-1", "1e3", "12.345"]) expect(priceFrom({ isFree: false, price }, false).ok, price).toBe(false);
  });
});

describe("rubric", () => {
  const all = (n: number) => Object.fromEntries(CRITERIA.map((c) => [c.key, n]));

  it("approves work that is good throughout and excellent in places", () => {
    expect(evaluateRubric({ ...all(3), accuracy: 4, pedagogy: 4 }, true).approvable).toBe(true);
    expect(evaluateRubric({ ...all(4) }, false).approvable).toBe(true);
  });

  it("does not approve all-'Good' work: the average must reach the bar", () => {
    const r = evaluateRubric(all(3), true);
    expect(r.mean).toBe(3);
    expect(r.mean).toBeLessThan(AVERAGE_PASS);
    expect(r.approvable).toBe(false);
  });

  it("never lets strengths elsewhere cover a failure on any criterion, least of all the gates", () => {
    for (const c of CRITERIA) {
      const r = evaluateRubric({ ...all(4), [c.key]: 2 }, true);
      expect(r.approvable, c.key).toBe(false);
      expect(r.failing).toEqual([c.label]);
    }
  });

  it("needs every applicable criterion scored, and ignores 'value' for free resources", () => {
    const r = evaluateRubric({ accuracy: 4 }, true);
    expect(r.missing).toHaveLength(CRITERIA.length - 1);
    expect(evaluateRubric({ ...all(4), value: undefined as unknown as number }, false).approvable).toBe(true);
    expect(evaluateRubric({ ...all(4), value: undefined as unknown as number }, true).approvable).toBe(false);
  });

  it("rejects out-of-range and fractional scores", () => {
    expect(evaluateRubric({ ...all(4), accuracy: 5 }, true).missing).toContain("Accuracy and curriculum fit");
    expect(evaluateRubric({ ...all(4), accuracy: 3.5 }, true).approvable).toBe(false);
    expect(evaluateRubric({ ...all(4), accuracy: -1 }, true).approvable).toBe(false);
  });
});
