import { describe, expect, it } from "vitest";
import { containsContactDetails, defaultDisplayName } from "@/server/tutors/service";

describe("public profile safety", () => {
  it.each(["me@example.com", "call 0244 123 456", "+233 24 000 1111", "(024) 123-4567", "https://x.co", "www.example.com", "a@b.co"])(
    "flags contact details in %j",
    (t) => expect(containsContactDetails(t)).toBe(true),
  );
  it.each(["Six years teaching JHS mathematics", "Taught 120 learners across 2 schools", "BECE 2019 top tutor", ""])("allows %j", (t) =>
    expect(containsContactDetails(t)).toBe(false),
  );
  it("shows first name and last initial only", () => {
    expect(defaultDisplayName("Ama Serwaa Mensah")).toBe("Ama M.");
    expect(defaultDisplayName("kofi boateng")).toBe("kofi B.");
    expect(defaultDisplayName("Yaa")).toBe("Yaa");
    expect(defaultDisplayName("   ")).toBe("Tutor");
  });
});
