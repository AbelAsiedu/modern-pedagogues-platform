import { describe, expect, it } from "vitest";
import {
  MoneyError,
  add,
  format,
  money,
  multiplyByQuantity,
  parseDecimal,
  percentOf,
  splitSale,
  subtract,
  sum,
} from "@/lib/money";

describe("parseDecimal", () => {
  it("parses whole and fractional cedis into pesewas", () => {
    expect(parseDecimal("100").amount).toBe(10000n);
    expect(parseDecimal("100.5").amount).toBe(10050n);
    expect(parseDecimal("0.07").amount).toBe(7n);
    expect(parseDecimal("1,250.00").amount).toBe(125000n);
  });
  it("is exact where floats are not", () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in minor units it is exact.
    expect(add(parseDecimal("0.10"), parseDecimal("0.20")).amount).toBe(parseDecimal("0.30").amount);
  });
  it.each(["", "abc", "-5", "1e3", "10.123", "1.", ".5", "1 000", "NaN", "Infinity"])("rejects %j", (bad) => {
    expect(() => parseDecimal(bad)).toThrow(MoneyError);
  });
});

describe("arithmetic", () => {
  it("adds, subtracts and sums in the same currency", () => {
    expect(add(money(150n), money(250n)).amount).toBe(400n);
    expect(subtract(money(150n), money(250n)).amount).toBe(-100n);
    expect(sum([money(1n), money(2n), money(3n)]).amount).toBe(6n);
  });
  it("refuses to mix currencies", () => {
    expect(() => add(money(1n, "GHS"), money(1n, "USD"))).toThrow(/mismatch/);
  });
  it("multiplies by whole quantities only", () => {
    expect(multiplyByQuantity(money(10000n), 4).amount).toBe(40000n);
    expect(() => multiplyByQuantity(money(1n), 1.5)).toThrow(MoneyError);
    expect(() => multiplyByQuantity(money(1n), -1)).toThrow(MoneyError);
  });
  it("stays exact beyond Number.MAX_SAFE_INTEGER", () => {
    const big = money(9_007_199_254_740_993n);
    expect(add(big, money(1n)).amount).toBe(9_007_199_254_740_994n);
  });
  it("rejects non-bigint amounts", () => {
    expect(() => money(100 as unknown as bigint)).toThrow(MoneyError);
  });
});

describe("percentOf", () => {
  it("rounds half up to the nearest pesewa", () => {
    expect(percentOf(money(1050n), 1000).amount).toBe(105n); // 10% of 10.50
    expect(percentOf(money(5n), 1000).amount).toBe(1n); // 0.5 -> 1
    expect(percentOf(money(4n), 1000).amount).toBe(0n); // 0.4 -> 0
  });
  it("rejects invalid basis points", () => {
    expect(() => percentOf(money(100n), 1.5)).toThrow(MoneyError);
    expect(() => percentOf(money(100n), 10_001)).toThrow(MoneyError);
    expect(() => percentOf(money(100n), -1)).toThrow(MoneyError);
  });
});

describe("format", () => {
  it("formats with grouping and two decimals", () => {
    expect(format(money(125000n))).toBe("GH₵ 1,250.00");
    expect(format(money(5n))).toBe("GH₵ 0.05");
    expect(format(money(-10050n))).toBe("-GH₵ 100.50");
    expect(format(money(10000n, "USD"))).toBe("$ 100.00");
  });
});

describe("splitSale", () => {
  it("always reconciles to the gross amount", () => {
    for (const gross of [1n, 7n, 99n, 1000n, 12_345n, 999_999n]) {
      for (const commissionBps of [0, 1, 1000, 2000, 3333, 10_000]) {
        for (const feeBps of [0, 150, 195, 300]) {
          for (const feeBearer of ["platform", "creator"] as const) {
            let split;
            try {
              split = splitSale({ gross: money(gross), commissionBps, processingFeeBps: feeBps, feeBearer });
            } catch (e) {
              // Only "fees exceed the sale" is an acceptable refusal.
              expect((e as Error).message).toMatch(/exceed/);
              continue;
            }
            const total = split.creatorShare.amount + split.platformNet.amount + split.processingFee.amount;
            expect(total).toBe(gross);
            expect(split.creatorShare.amount >= 0n).toBe(true);
          }
        }
      }
    }
  });
  it("platform bearing the fee leaves the creator's share unaffected", () => {
    const s = splitSale({ gross: money(10000n), commissionBps: 2000, processingFeeBps: 195, feeBearer: "platform" });
    expect(s.creatorShare.amount).toBe(8000n);
    expect(s.processingFee.amount).toBe(195n);
    expect(s.platformNet.amount).toBe(10000n - 8000n - 195n);
  });
  it("creator bearing the fee reduces the creator's share", () => {
    const s = splitSale({ gross: money(10000n), commissionBps: 2000, processingFeeBps: 195, feeBearer: "creator" });
    expect(s.creatorShare.amount).toBe(10000n - 2000n - 195n);
    expect(s.platformNet.amount).toBe(2000n);
  });
  it("refuses negative gross", () => {
    expect(() => splitSale({ gross: money(-1n), commissionBps: 0, processingFeeBps: 0, feeBearer: "platform" })).toThrow(MoneyError);
  });
});
