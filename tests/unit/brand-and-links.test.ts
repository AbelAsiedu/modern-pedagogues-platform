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
