import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";
import { initializeTransaction, PaystackError, paystackMode, signatureValid, verifyTransaction } from "@/server/payments/paystack";

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const cfg = (f: typeof fetch) => ({ secretKey: "sk_test_abcdefgh1234", apiUrl: "https://api.paystack.co", fetchImpl: f });

describe("paystack signatures", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: "TMP-ABC234-1a2b3c4d" } });
  const sign = (b: string, key: string) => createHmac("sha512", key).update(b).digest("hex");

  it("accepts the HMAC-SHA512 of the exact body and rejects everything else", () => {
    const key = "sk_test_abcdefgh1234";
    expect(signatureValid(body, sign(body, key), key)).toBe(true);
    expect(signatureValid(body + " ", sign(body, key), key)).toBe(false); // body changed
    expect(signatureValid(body, sign(body, "sk_test_otherotherother"), key)).toBe(false); // wrong key
    expect(signatureValid(body, null, key)).toBe(false);
    expect(signatureValid(body, "", key)).toBe(false);
    expect(signatureValid(body, "not-hex", key)).toBe(false);
    expect(signatureValid(body, sign(body, key).slice(0, 100), key)).toBe(false);
  });
});

describe("paystack client", () => {
  it("starts a GHS payment in pesewas with a fresh reference, offering Mobile Money and card", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/abc", reference: "R-1234567" } }));
    }) as unknown as typeof fetch;
    const out = await initializeTransaction(cfg(f), { email: "a@b.com", amountMinor: 2500n, reference: "R-1234567", callbackUrl: "https://tmp.example/api/paystack/callback", metadata: { order: "TMP-X" } });
    expect(out).toEqual({ authorizationUrl: "https://checkout.paystack.com/abc", reference: "R-1234567" });
    expect(seen!.url).toBe("https://api.paystack.co/transaction/initialize");
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("Bearer sk_test_abcdefgh1234");
    const sent = JSON.parse(String(seen!.init.body));
    expect(sent).toMatchObject({ amount: "2500", currency: "GHS", reference: "R-1234567", channels: ["mobile_money", "card"], email: "a@b.com" });
  });

  it("refuses a non-https payment page and reports Paystack's own error message", async () => {
    await expect(initializeTransaction(cfg(reply({ status: true, data: { authorization_url: "http://evil.example/x", reference: "R" } })), { email: "a@b.com", amountMinor: 100n, reference: "R", callbackUrl: "https://t.example/c", metadata: {} })).rejects.toBeInstanceOf(PaystackError);
    await expect(initializeTransaction(cfg(reply({ status: false, message: "Invalid key" }, 401)), { email: "a@b.com", amountMinor: 100n, reference: "R", callbackUrl: "https://t.example/c", metadata: {} })).rejects.toThrow(/Invalid key/);
  });

  it("turns a network failure into a friendly error", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(verifyTransaction(cfg(f), "R-1234567")).rejects.toThrow(/Could not reach Paystack/);
  });

  it("reads a verified payment as integer pesewas and rejects an answer about another reference", async () => {
    const ok = reply({ status: true, data: { reference: "R-1234567", status: "success", amount: 2500, currency: "GHS", channel: "mobile_money" } });
    expect(await verifyTransaction(cfg(ok), "R-1234567")).toEqual({ reference: "R-1234567", status: "success", amountMinor: 2500n, currency: "GHS", channel: "mobile_money" });
    const other = reply({ status: true, data: { reference: "SOMETHING-ELSE", status: "success", amount: 2500, currency: "GHS" } });
    await expect(verifyTransaction(cfg(other), "R-1234567")).rejects.toBeInstanceOf(PaystackError);
  });
});

describe("paystack settings", () => {
  const base = { NODE_ENV: "test", APP_URL: "http://localhost:3000", DATABASE_URL: "postgres://x" };
  it("is optional, and only accepts a secret key", () => {
    expect(parseEnv(base).PAYSTACK_SECRET_KEY).toBeUndefined();
    expect(parseEnv({ ...base, PAYSTACK_SECRET_KEY: "sk_test_abcdefgh1234" }).PAYSTACK_SECRET_KEY).toBeTruthy();
    expect(() => parseEnv({ ...base, PAYSTACK_SECRET_KEY: "pk_test_abcdefgh1234" })).toThrow(/PAYSTACK_SECRET_KEY/);
    expect(() => parseEnv({ ...base, PAYSTACK_SECRET_KEY: "nonsense" })).toThrow(/SECRET key/);
  });
  it("names the mode from the key", () => {
    expect(paystackMode(undefined)).toBe("off");
    expect(paystackMode("sk_test_abcdefgh1234")).toBe("test");
    expect(paystackMode("sk_live_abcdefgh1234")).toBe("live");
  });
});
