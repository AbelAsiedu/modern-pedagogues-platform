import { describe, expect, it } from "vitest";
import { format } from "@/lib/money";
import { INDICATIVE_TUTORING_RATE, SITE, whatsappLink } from "@/lib/site";

describe("site facts", () => {
  it("shows the owner-decided starting rate of GHS 100 per session", () => {
    expect(INDICATIVE_TUTORING_RATE.amount).toBe(10_000n);
    expect(format(INDICATIVE_TUTORING_RATE)).toBe("GH₵ 100.00");
  });
  it("uses the owner's contact email", () => {
    expect(SITE.email).toBe("themodernpedagogues@gmail.com");
  });
  it("builds an encoded WhatsApp link", () => {
    const link = whatsappLink("Hello TMP & friends");
    expect(link).toBe("https://wa.me/233593660708?text=Hello%20TMP%20%26%20friends");
  });
});
