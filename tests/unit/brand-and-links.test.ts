import { describe, expect, it } from "vitest";
import { acronym } from "@/components/site/Brand";
import { buildSiteText } from "@/server/content/site-content";
import { getEntry } from "@/server/content/registry";

describe("acronym", () => {
  it("makes the monogram from the business name", () => {
    expect(acronym("The Modern Pedagogues")).toBe("TMP");
    expect(acronym("  bright   minds academy ")).toBe("BMA");
    expect(acronym("")).toBe("TMP");
  });
  it("never goes past four letters", () => {
    expect(acronym("A B C D E F")).toBe("ABCD");
  });
});

describe("social links", () => {
  const check = (key: string, value: string) => getEntry(key)?.validate?.(value) ?? null;
  it("accept https links only", () => {
    expect(check("site.facebook", "https://facebook.com/tmp")).toBeNull();
    expect(check("site.facebook", "http://facebook.com/tmp")).not.toBeNull();
    expect(check("site.instagram", "javascript:alert(1)")).not.toBeNull();
    expect(check("site.instagram", "not a link")).not.toBeNull();
  });
});

describe("image slots in site text", () => {
  it("read as empty until set, with their description", () => {
    const t = buildSiteText(new Map(), new Map());
    expect(t.image("home.about.image")).toBe("");
    const set = buildSiteText(new Map([["home.about.image", "/media/a.png"]]), new Map([["home.about.image", "Tutors"]]));
    expect(set.image("home.about.image")).toBe("/media/a.png");
    expect(set.imageAlt("home.about.image")).toBe("Tutors");
  });
});

describe("Graphing Studio feature", () => {
  it("only accepts a secure (https) address, and ships with one", () => {
    const entry = getEntry("graphing.url")!;
    expect(entry.default).toMatch(/^https:\/\//);
    expect(entry.validate!(entry.default)).toBeNull();
    expect(entry.validate!("http://example.com")).not.toBeNull();
    expect(entry.validate!("javascript:alert(1)")).not.toBeNull();
    expect(entry.optional).toBeFalsy();
  });
  it("lists the five features as Title | Description lines", () => {
    const lines = buildSiteText(new Map()).lines("graphing.features.items");
    expect(lines.map((l) => l.split("|")[0]!.trim())).toEqual([
      "Drawing instruments",
      "Graph paper",
      "Equation plotting",
      "Statistical charts",
      "Geometric constructions",
    ]);
    expect(lines.every((l) => l.includes("|"))).toBe(true);
  });
});
