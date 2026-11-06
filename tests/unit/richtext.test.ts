import { describe, expect, it } from "vitest";
import { fillTemplate, isSafeHref, parseInline, parseRichText } from "@/lib/richtext";
import { CONTENT_ENTRIES, CONTENT_GROUPS, getEntry } from "@/server/content/registry";
import { buildSiteText } from "@/server/content/site-content";
import { templateVars } from "@/lib/site-content";

describe("rich text", () => {
  it("parses headings, paragraphs, bullets and bold", () => {
    const b = parseRichText("## Title\n\nOne line\ncontinues.\n\n- a\n- **b**\n\nEnd");
    expect(b.map((x) => x.t)).toEqual(["h", "p", "ul", "p"]);
    expect(b[1]).toEqual({ t: "p", c: [{ t: "text", v: "One line continues." }] });
    expect(b[2]).toMatchObject({ t: "ul", items: [[{ t: "text", v: "a" }], [{ t: "bold", v: "b" }]] });
  });
  it("keeps safe links and drops unsafe ones to plain text", () => {
    expect(parseInline("[ok](/pricing) [web](https://example.com) [mail](mailto:a@b.co)").filter((n) => n.t === "link")).toHaveLength(3);
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "http://plain.example"]) {
      const out = parseInline(`[click](${href})`);
      expect(out.some((n) => n.t === "link")).toBe(false);
      expect(out[0]).toEqual({ t: "text", v: "click" });
    }
  });
  it("never produces HTML: markup in the source stays literal text", () => {
    const [p] = parseRichText("<script>alert(1)</script> <img src=x onerror=alert(1)>");
    expect(p).toEqual({ t: "p", c: [{ t: "text", v: "<script>alert(1)</script> <img src=x onerror=alert(1)>" }] });
  });
  it("isSafeHref matches the banner link policy", () => {
    expect(isSafeHref("/contact")).toBe(true);
    expect(isSafeHref("tel:+233593660708")).toBe(true);
    expect(isSafeHref("//x.y")).toBe(false);
    expect(isSafeHref("javascript:1")).toBe(false);
  });
  it("fills known tokens and leaves unknown ones visible", () => {
    expect(fillTemplate("Hi {name} {typo}", { name: "TMP" })).toBe("Hi TMP {typo}");
    expect(fillTemplate("{constructor}", {})).toBe("{constructor}");
  });
});

describe("site text registry", () => {
  it("has unique keys, known groups, and defaults that fit their own limit", () => {
    const keys = CONTENT_ENTRIES.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    const groups = new Set(CONTENT_GROUPS.map((g) => g.id));
    for (const x of CONTENT_ENTRIES) {
      expect(groups.has(x.group), x.key).toBe(true);
      expect(x.default.length, x.key).toBeLessThanOrEqual(x.max);
      if (!x.optional) expect(x.default.trim(), x.key).not.toBe("");
      if (x.kind === "line") expect(x.default, x.key).not.toContain("\n");
    }
  });
  it("uses only tokens that exist, so defaults never show a raw {token}", () => {
    const vars = templateVars();
    for (const x of CONTENT_ENTRIES) {
      for (const m of x.default.matchAll(/\{([a-z_]+)\}/g)) expect(Object.hasOwn(vars, m[1]!), `${x.key} uses {${m[1]}}`).toBe(true);
    }
  });
  it("puts the legal pages behind the legal permission", () => {
    for (const k of ["legal.terms", "legal.privacy", "legal.refunds"]) expect(getEntry(k)?.permission).toBe("content.manage_legal");
  });
  it("builds visitor text from defaults, overrides and tokens", () => {
    const t = buildSiteText(new Map([["home.talk.label", "Say hello"]]));
    expect(t.text("home.talk.label")).toBe("Say hello");
    expect(t.text("home.fees.body")).toContain("GH₵");
    expect(t.text("home.fees.body")).not.toContain("{rate}");
    expect(t.lines("pricing.how.steps")).toHaveLength(4);
    expect(() => t.text("no.such.key")).toThrow();
  });
});
