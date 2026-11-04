/**
 * Money is always an integer count of minor units (pesewas for GHS) held in a bigint, with an
 * explicit currency. There is no floating-point arithmetic anywhere in this module, and amounts
 * beyond 2^53 stay exact. Percentages are expressed in basis points (1 bp = 0.01%).
 */

export const CURRENCIES = {
  GHS: { minorUnits: 2, symbol: "GH₵", name: "Ghanaian cedi" },
  USD: { minorUnits: 2, symbol: "$", name: "US dollar" },
  GBP: { minorUnits: 2, symbol: "£", name: "Pound sterling" },
  EUR: { minorUnits: 2, symbol: "€", name: "Euro" },
  CAD: { minorUnits: 2, symbol: "CA$", name: "Canadian dollar" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;
export const DEFAULT_CURRENCY: CurrencyCode = "GHS";
export const BPS_DENOMINATOR = 10_000n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export type Money = Readonly<{ amount: bigint; currency: CurrencyCode }>;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function money(amount: bigint, currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  if (typeof amount !== "bigint") throw new MoneyError("amount must be a bigint of minor units");
  if (!isCurrencyCode(currency)) throw new MoneyError(`unsupported currency: ${String(currency)}`);
  return Object.freeze({ amount, currency });
}

const ten = 10n;
function scale(currency: CurrencyCode): bigint {
  return ten ** BigInt(CURRENCIES[currency].minorUnits);
}

/**
 * Parse user/admin input such as "100", "100.5" or "1,250.00" into minor units.
 * Strict: at most the currency's decimal places, no exponent, no sign, no stray characters.
 */
export function parseDecimal(input: string, currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  const places = CURRENCIES[currency].minorUnits;
  const cleaned = input.trim().replace(/,/g, "");
  const pattern = new RegExp(`^(\\d{1,15})(?:\\.(\\d{1,${places}}))?$`);
  const match = pattern.exec(cleaned);
  if (!match) throw new MoneyError(`invalid ${currency} amount: ${JSON.stringify(input)}`);
  const whole = BigInt(match[1]!);
  const fraction = (match[2] ?? "").padEnd(places, "0");
  return money(whole * scale(currency) + BigInt(fraction === "" ? "0" : fraction), currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function sum(items: readonly Money[], currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  return items.reduce((acc, m) => add(acc, m), money(0n, currency));
}

export function multiplyByQuantity(m: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new MoneyError("quantity must be a non-negative integer");
  return money(m.amount * BigInt(quantity), m.currency);
}

export function isNegative(m: Money): boolean {
  return m.amount < 0n;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

/** Percentage in basis points, rounded half away from zero to the nearest minor unit. */
export function percentOf(m: Money, bps: number): Money {
  assertBps(bps);
  const numerator = m.amount * BigInt(bps);
  const half = BPS_DENOMINATOR / 2n;
  const rounded =
    numerator >= 0n
      ? (numerator + half) / BPS_DENOMINATOR
      : -((-numerator + half) / BPS_DENOMINATOR);
  return money(rounded, m.currency);
}

export function assertBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new MoneyError("basis points must be an integer between 0 and 10000");
  }
}

/** "GH₵ 1,250.00". Formatting only; never parse this back. */
export function format(m: Money): string {
  const { minorUnits, symbol } = CURRENCIES[m.currency];
  const negative = m.amount < 0n;
  const abs = negative ? -m.amount : m.amount;
  const unit = scale(m.currency);
  const whole = (abs / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (abs % unit).toString().padStart(minorUnits, "0");
  return `${negative ? "-" : ""}${symbol} ${whole}.${fraction}`;
}

export type FeeBearer = "platform" | "creator";

export type SaleSplit = Readonly<{
  gross: Money;
  /** Charged by the payment provider. */
  processingFee: Money;
  /** The platform's agreed share of the gross sale. */
  platformCommission: Money;
  /** What the creator is owed. */
  creatorShare: Money;
  /** What the platform keeps after paying the provider. */
  platformNet: Money;
}>;

/**
 * Split a marketplace sale. Rates are configuration, not constants: pass whatever the owner has agreed.
 * Invariant (always true, asserted below): creatorShare + platformNet + processingFee === gross,
 * so the ledger always reconciles to the penny regardless of rounding.
 */
export function splitSale(input: {
  gross: Money;
  commissionBps: number;
  processingFeeBps: number;
  feeBearer: FeeBearer;
}): SaleSplit {
  const { gross, commissionBps, processingFeeBps, feeBearer } = input;
  if (isNegative(gross)) throw new MoneyError("gross must not be negative");
  assertBps(commissionBps);
  assertBps(processingFeeBps);

  const processingFee = percentOf(gross, processingFeeBps);
  const platformCommission = percentOf(gross, commissionBps);

  const creatorShare =
    feeBearer === "creator"
      ? subtract(subtract(gross, platformCommission), processingFee)
      : subtract(gross, platformCommission);
  if (isNegative(creatorShare)) throw new MoneyError("commission and fees exceed the sale amount");

  const platformNet = subtract(subtract(gross, creatorShare), processingFee);

  const check = add(add(creatorShare, platformNet), processingFee);
  if (!equals(check, gross)) throw new MoneyError("internal error: split does not reconcile");

  return Object.freeze({ gross, processingFee, platformCommission, creatorShare, platformNet });
}
