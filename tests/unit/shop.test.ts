import { describe, expect, it } from "vitest";
import { containsContactDetails, listingInput, priceFrom } from "@/server/resources/quality";
import { looksLikePdf, slugify, toDecimal } from "@/server/shop/service";

const base = { title: "BECE Maths Past Questions", summary: "Ten years of BECE Mathematics papers with worked answers.", description: "", kind: "PAST_QUESTIONS", price: "25", coverPath: "", sortOrder: "0" };
const staffPrice = (price: string, isFree = false) => priceFrom({ isFree, price }, false);
const creatorPrice = (price: string, isFree = false) => priceFrom({ isFree, price }, true);

describe("listing input", () => {
  it("turns a cedi price into pesewas exactly", () => {
    expect(staffPrice("25")).toEqual({ ok: true, pesewas: 2500n });
    expect(staffPrice("25.5")).toEqual({ ok: true, pesewas: 2550n });
    expect(staffPrice("1,250.00")).toEqual({ ok: true, pesewas: 125000n });
  });

  it("rejects prices that are absurd, negative or not numbers (staff floor GH₵ 1)", () => {
    for (const price of ["0", "0.50", "5000.01", "-5", "abc", "", "1e3", "12.345"]) {
      expect(staffPrice(price).ok, price).toBe(false);
    }
    expect(staffPrice("5000").ok).toBe(true);
    expect(staffPrice("1").ok).toBe(true);
  });

  it("holds creators to a GH₵ 5 floor for paid work, and lets anyone give work away free", () => {
    expect(creatorPrice("4.99").ok).toBe(false);
    expect(creatorPrice("5").ok).toBe(true);
    expect(creatorPrice("", true)).toEqual({ ok: true, pesewas: 0n });
    expect(staffPrice("0", true)).toEqual({ ok: true, pesewas: 0n });
  });

  it("accepts only media-library pictures as covers", () => {
    expect(listingInput.safeParse({ ...base, coverPath: "/media/0194b2c8-1d3a-7c4e-9a52-0f6a1b2c3d4e.webp" }).success).toBe(true);
    for (const coverPath of ["https://x.example/a.jpg", "//x.example/a.jpg", "/media/../a.jpg", "javascript:alert(1)"]) {
      expect(listingInput.safeParse({ ...base, coverPath }).success, coverPath).toBe(false);
    }
  });

  it("requires a real title, a known kind, and no contact details in the text", () => {
    expect(listingInput.safeParse({ ...base, title: "ab" }).success).toBe(false);
    expect(listingInput.safeParse({ ...base, kind: "NOPE" }).success).toBe(false);
    for (const summary of ["Email me at abc@example.com for more", "Get more at https://example.com", "Call +233 59 366 0708 for the rest", "WhatsApp me on 0593660708 now"]) {
      expect(listingInput.safeParse({ ...base, summary }).success, summary).toBe(false);
    }
  });

  it("does not mistake years and ranges for phone numbers", () => {
    for (const t of ["BECE past questions 2019-2023", "Papers for 2020 2021 2022 and 2023", "Grade 7 to 9, 40 pages, 120 questions"]) expect(containsContactDetails(t), t).toBe(false);
    expect(listingInput.safeParse({ ...base, title: "BECE Maths 2015-2024 Past Questions" }).success).toBe(true);
  });

  it("reads learning outcomes from lines and de-duplicates levels", () => {
    const r = listingInput.parse({ ...base, outcomes: "Solve linear equations\n\n  Draw graphs of functions \n", levelKeys: ["jhs", "jhs", "shs"] });
    expect(r.outcomes).toEqual(["Solve linear equations", "Draw graphs of functions"]);
    expect(r.levelKeys).toEqual(["jhs", "shs"]);
  });
});

describe("helpers", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("BECE Maths: Past Questions (2015–2024)!")).toBe("bece-maths-past-questions-2015-2024");
    expect(slugify("  Café Résumé  ")).toBe("cafe-resume");
    expect(slugify("!!!")).toBe("resource");
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it("formats pesewas for the edit form without floats", () => {
    expect(toDecimal(2550n)).toBe("25.50");
    expect(toDecimal(100n)).toBe("1.00");
    expect(toDecimal(105n)).toBe("1.05");
    expect(toDecimal(500000n)).toBe("5000.00");
  });

  it("recognises a PDF by its first bytes, not its name", () => {
    expect(looksLikePdf(Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj"))).toBe(true);
    expect(looksLikePdf(Buffer.from("<html>%PDF-1.7</html>"))).toBe(false);
    expect(looksLikePdf(Buffer.from("MZ\x90\x00 not a pdf at all"))).toBe(false);
    expect(looksLikePdf(Buffer.alloc(0))).toBe(false);
  });
});
