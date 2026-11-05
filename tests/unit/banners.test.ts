import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/errors";
import { bannerInput, DEFAULT_BANNERS, safeLink } from "@/server/content/banners";
import { parseOrThrow } from "@/server/auth/validation";
import { safeNext } from "@/lib/safe-redirect";

const ok = { title: "Hello", imagePath: "/images/slide-1.svg" };

describe("banner validation", () => {
  it("accepts same-site images and normalises empties to null", () => {
    const b = parseOrThrow(bannerInput, { ...ok, subtitle: "", buttonText: "", buttonUrl: "" });
    expect(b.subtitle).toBeNull();
    expect(b.buttonUrl).toBeNull();
    expect(b.isActive).toBe(true);
  });
  it.each(["https://evil.example/x.png", "//evil.example/x.png", "/images/../secret.png", "javascript:alert(1)", "data:image/svg+xml;base64,AAAA", "/images/x.exe", "images/x.png", "/images/a b.png"])(
    "rejects image path %j",
    (imagePath) => {
      expect(() => parseOrThrow(bannerInput, { ...ok, imagePath })).toThrow(ValidationError);
    },
  );
  it.each(["/contact", "https://wa.me/233593660708", "mailto:a@b.co", "tel:+233593660708"])("allows link %j", (u) => {
    expect(safeLink.safeParse(u).success).toBe(true);
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "//evil.example", "http://insecure.example", "ftp://x", "/with space"])("blocks link %j", (u) => {
    expect(safeLink.safeParse(u).success).toBe(false);
  });
  it("rejects missing title and absurd ordering", () => {
    expect(() => parseOrThrow(bannerInput, { ...ok, title: "" })).toThrow(ValidationError);
    expect(() => parseOrThrow(bannerInput, { ...ok, sortOrder: 99999 })).toThrow(ValidationError);
  });
  it("ships three default slides whose links are all safe", () => {
    expect(DEFAULT_BANNERS).toHaveLength(3);
    for (const b of DEFAULT_BANNERS) expect(safeLink.safeParse(b.buttonUrl).success).toBe(true);
  });
});

describe("post-login redirect safety", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/admin/users")).toBe("/admin/users");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad as never)).toBe("/account");
    }
  });
});
