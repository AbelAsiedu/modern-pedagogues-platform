import { describe, expect, it } from "vitest";
import { looksLikePdf, productInput, slugify, toDecimal } from "@/server/shop/service";

const base = { title: "BECE Maths Past Questions", summary: "Ten years of BECE Mathematics papers with worked answers.", description: "", price: "25", coverPath: "", sortOrder: "0" };

describe("product input", () => {
  it("turns a cedi price into pesewas exactly", () => {
    expect(productInput.parse({ ...base, price: "25" }).price).toBe(2500n);
    expect(productInput.parse({ ...base, price: "25.5" }).price).toBe(2550n);
    expect(productInput.parse({ ...base, price: "1,250.00" }).price).toBe(125000n);
  });

  it("rejects prices that are free, absurd, negative or not numbers", () => {
    for (const price of ["0", "0.50", "5000.01", "-5", "abc", "", "1e3", "12.345"]) {
      expect(productInput.safeParse({ ...base, price }).success, price).toBe(false);
    }
    expect(productInput.safeParse({ ...base, price: "5000" }).success).toBe(true);
    expect(productInput.safeParse({ ...base, price: "1" }).success).toBe(true);
  });

  it("accepts only media-library pictures as covers", () => {
    expect(productInput.safeParse({ ...base, coverPath: "/media/0194b2c8-1d3a-7c4e-9a52-0f6a1b2c3d4e.webp" }).success).toBe(true);
    for (const coverPath of ["https://x.example/a.jpg", "//x.example/a.jpg", "/media/../a.jpg", "javascript:alert(1)"]) {
      expect(productInput.safeParse({ ...base, coverPath }).success, coverPath).toBe(false);
    }
  });

  it("requires a real title and summary", () => {
    expect(productInput.safeParse({ ...base, title: "ab" }).success).toBe(false);
    expect(productInput.safeParse({ ...base, summary: "short" }).success).toBe(false);
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
