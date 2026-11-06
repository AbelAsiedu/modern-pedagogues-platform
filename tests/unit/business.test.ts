import { describe, expect, it } from "vitest";
import { businessFrom, DEFAULT_BUSINESS, internationalDigits, whatsappUrl } from "@/lib/business";
import { parseTestimonials } from "@/lib/testimonials";
import { CONTENT_ENTRIES, getEntry } from "@/server/content/registry";

describe("phone numbers", () => {
  it("turns a displayed number into digits with the country code", () => {
    expect(internationalDigits("+233 59 366 0708")).toBe("233593660708");
    expect(internationalDigits("0593660708")).toBe("233593660708");
    expect(internationalDigits("00233 59 366 0708")).toBe("233593660708");
    expect(internationalDigits("+44 (20) 7946 0958")).toBe("442079460958");
  });

  it("builds the business facts from text values and makes tel and WhatsApp links from the phone", () => {
    const values: Record<string, string> = {
      "site.name": "Acme Tutors",
      "site.motto": "Learn",
      "site.email": "hi@acme.example",
      "site.phone": "0244 123 456",
      "site.momo_network": "Vodafone Cash",
      "site.momo_number": "0501234567",
    };
    const b = businessFrom((k) => values[k]!);
    expect(b).toMatchObject({ name: "Acme Tutors", email: "hi@acme.example", phoneTel: "+233244123456", whatsappNumber: "233244123456", momoNetwork: "Vodafone Cash", momoNumber: "0501234567" });
    expect(whatsappUrl(b, "Hi & hello")).toBe("https://wa.me/233244123456?text=Hi%20%26%20hello");
  });

  it("the registry defaults reproduce the built-in business facts exactly", () => {
    const b = businessFrom((k) => getEntry(k)!.default);
    expect(b).toEqual(DEFAULT_BUSINESS);
  });
});

describe("business detail validation", () => {
  const check = (key: string, v: string) => getEntry(key)!.validate!(v);
  it("accepts good values and gives plain-words problems for bad ones", () => {
    expect(check("site.email", "a@b.co")).toBeNull();
    expect(check("site.email", "not an email")).toMatch(/valid email/);
    expect(check("site.phone", "+233 24 123 4567")).toBeNull();
    expect(check("site.phone", "call me")).toMatch(/valid phone/);
    expect(check("site.phone", "123")).toMatch(/valid phone/);
    expect(check("site.momo_number", "0244123456")).toBeNull();
    expect(check("home.slideshow.seconds", "6")).toBeNull();
    expect(check("home.slideshow.seconds", "2")).toMatch(/3 to 20/);
    expect(check("home.slideshow.seconds", "99")).toMatch(/3 to 20/);
    expect(check("home.slideshow.seconds", "fast")).toMatch(/3 to 20/);
  });

  it("business details need the legal permission, while social links and the logo need only the site permission", () => {
    const open = new Set(["site.facebook", "site.instagram", "site.x", "site.youtube", "site.linkedin", "site.tiktok", "site.logo"]);
    for (const x of CONTENT_ENTRIES.filter((e) => e.key.startsWith("site."))) {
      expect(x.permission, x.key).toBe(open.has(x.key) ? "content.manage_site" : "content.manage_legal");
    }
  });
});

describe("testimonials", () => {
  it("parses 'quote | name' lines, ignores empty quotes, and supplies a name when missing", () => {
    expect(parseTestimonials(["Great lessons | Ama, parent", "Loved it", " | nobody", "A | b | c"])).toEqual([
      { quote: "Great lessons", by: "Ama, parent" },
      { quote: "Loved it", by: "A TMP family" },
      { quote: "A", by: "b | c" },
    ]);
    expect(parseTestimonials([])).toEqual([]);
  });
});
