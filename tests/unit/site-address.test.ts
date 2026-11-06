import { describe, expect, it } from "vitest";
import { checkSiteAddress } from "@/lib/site-address";

describe("checkSiteAddress", () => {
  it("is fine when the setting matches the address in use, ignoring case and the path", () => {
    expect(checkSiteAddress("https://themodernpedagogues-70f4f230adc2.herokuapp.com", "themodernpedagogues-70f4f230adc2.herokuapp.com")).toEqual({ ok: true });
    expect(checkSiteAddress("https://Example.com/", "example.com")).toEqual({ ok: true });
  });
  it("warns when email links would go to a different address, with the exact fix", () => {
    const r = checkSiteAddress("https://themodernpedagogues.herokuapp.com", "themodernpedagogues-70f4f230adc2.herokuapp.com");
    expect(r).toEqual({
      ok: false,
      configured: "themodernpedagogues.herokuapp.com",
      actual: "themodernpedagogues-70f4f230adc2.herokuapp.com",
      command: "heroku config:set APP_URL=https://themodernpedagogues-70f4f230adc2.herokuapp.com -a themodernpedagogues",
    });
  });
  it("does not nag on local development or when the host is unknown", () => {
    expect(checkSiteAddress("https://example.com", "localhost:3000")).toEqual({ ok: true });
    expect(checkSiteAddress("https://example.com", "127.0.0.1:3201")).toEqual({ ok: true });
    expect(checkSiteAddress("https://example.com", null)).toEqual({ ok: true });
    expect(checkSiteAddress("not a url", "example.com")).toEqual({ ok: true });
  });
});
