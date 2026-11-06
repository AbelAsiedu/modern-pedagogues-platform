import { describe, expect, it } from "vitest";
import { testProviders } from "@/server/assistant/service";
import { ProviderError, type LlmProvider } from "@/server/assistant/providers";
import { ForbiddenError } from "@/server/errors";

const actor = { id: "u1", status: "ACTIVE", roles: ["admin"] } as const;
const ok = (name: string): LlmProvider => ({ name, complete: async () => "OK" });
const failing = (name: string, status: number | "network" | "timeout"): LlmProvider => ({
  name,
  complete: async () => {
    throw new ProviderError(name, status);
  },
});

describe("testProviders", () => {
  it("reports each provider separately and never includes keys or raw errors", async () => {
    const res = await testProviders([ok("gemini"), failing("openrouter", 403), failing("mistral", 429)], actor);
    expect(res.map((r) => [r.provider, r.ok])).toEqual([["gemini", true], ["openrouter", false], ["mistral", false]]);
    expect(res[1]!.detail).toMatch(/key is probably wrong/i);
    expect(res[2]!.detail).toMatch(/quota/i);
  });

  it("explains a wrong model name, a network failure and a timeout in plain words", async () => {
    const [a, b, c] = await testProviders([failing("g", 404), failing("g", "network"), failing("g", "timeout")], actor);
    expect(a!.detail).toMatch(/model/i);
    expect(b!.detail).toMatch(/reach/i);
    expect(c!.detail).toMatch(/time limit/i);
  });

  it("treats an empty answer as a failure", async () => {
    const [r] = await testProviders([{ name: "g", complete: async () => "" }], actor);
    expect(r!.ok).toBe(false);
  });

  it("is for assistant managers only", async () => {
    await expect(testProviders([ok("g")], { id: "p", status: "ACTIVE", roles: ["parent"] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(testProviders([ok("g")], null)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
