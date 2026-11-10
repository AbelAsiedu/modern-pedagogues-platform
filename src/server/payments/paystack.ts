import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Paystack client: start a payment, check a payment, verify a webhook signature. Nothing else.
 * Amounts are integer pesewas (GHS minor units), exactly as Paystack expects. The secret key stays on the server.
 */
export type PaystackConfig = { secretKey: string; apiUrl: string; fetchImpl?: typeof fetch };

export class PaystackError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "PaystackError";
  }
}

export function paystackMode(secretKey: string | undefined): "off" | "test" | "live" {
  if (!secretKey) return "off";
  return secretKey.startsWith("sk_live_") ? "live" : "test";
}

async function call<T>(cfg: PaystackConfig, path: string, init?: RequestInit): Promise<T> {
  const f = cfg.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${cfg.apiUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${cfg.secretKey}`, "content-type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new PaystackError("Could not reach Paystack. Please try again in a moment.");
  }
  type Body = { status?: boolean; message?: string; data?: T };
  let body: Body | null;
  try {
    body = (await res.json()) as Body;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.status !== true || body.data === undefined) {
    throw new PaystackError(body?.message ? `Paystack said: ${body.message}` : `Paystack answered with an error (${res.status}).`, res.status);
  }
  return body.data;
}

export type InitializedPayment = { authorizationUrl: string; reference: string };

export async function initializeTransaction(
  cfg: PaystackConfig,
  o: { email: string; amountMinor: bigint; reference: string; callbackUrl: string; metadata: Record<string, string> },
): Promise<InitializedPayment> {
  const data = await call<{ authorization_url?: string; reference?: string }>(cfg, "/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: o.email,
      amount: o.amountMinor.toString(),
      currency: "GHS",
      reference: o.reference,
      callback_url: o.callbackUrl,
      channels: ["mobile_money", "card"],
      metadata: o.metadata,
    }),
  });
  if (!data.authorization_url || !data.reference) throw new PaystackError("Paystack did not return a payment page.");
  try {
    if (new URL(data.authorization_url).protocol !== "https:") throw new Error("not https");
  } catch {
    throw new PaystackError("Paystack returned an unexpected payment address.");
  }
  return { authorizationUrl: data.authorization_url, reference: data.reference };
}

export type VerifiedPayment = { reference: string; status: string; amountMinor: bigint; currency: string; channel: string | null };

/** Ask Paystack what really happened to a reference. The only source of truth for "was it paid". */
export async function verifyTransaction(cfg: PaystackConfig, reference: string): Promise<VerifiedPayment> {
  const d = await call<{ reference?: string; status?: string; amount?: number | string; currency?: string; channel?: string | null }>(
    cfg,
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  if (d.reference !== reference || typeof d.status !== "string" || d.amount === undefined || typeof d.currency !== "string") {
    throw new PaystackError("Paystack's answer did not match the payment we asked about.");
  }
  let amountMinor: bigint;
  try {
    amountMinor = BigInt(d.amount);
  } catch {
    throw new PaystackError("Paystack's answer had an invalid amount.");
  }
  return { reference: d.reference, status: d.status, amountMinor, currency: d.currency, channel: d.channel ?? null };
}

/** `x-paystack-signature` is the hex HMAC-SHA512 of the raw request body, keyed with the secret key. */
export function signatureValid(rawBody: string, signature: string | null, secretKey: string): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
