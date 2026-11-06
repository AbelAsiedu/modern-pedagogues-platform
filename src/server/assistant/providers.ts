import type { ChatTurn } from "./guard";

/**
 * Language-model providers behind one interface, ported from the legacy site's gateway (tools/llm.js).
 * Providers are tried in order until one returns text. Keys are read on the server only and are sent only
 * to the provider's own API, in a request header.
 */

export type CompletionRequest = { system: string; history: ChatTurn[]; message: string };

export interface LlmProvider {
  readonly name: string;
  /** Returns the reply text, or null if the provider produced none. Throws on transport or API errors. */
  complete(req: CompletionRequest): Promise<string | null>;
}

export type ProviderConfig = {
  GEMINI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  GEMINI_MODEL: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL: string;
  MISTRAL_API_KEY?: string;
  MISTRAL_MODEL: string;
  APP_URL: string;
};

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const TEMPERATURE = 0.35;
const MAX_TOKENS = 900;

/** Errors carry the provider and HTTP status only. The response body can echo the visitor's message, so it is not kept. */
export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number | "network" | "timeout",
  ) {
    super(`${provider} request failed (${status})`);
    this.name = "ProviderError";
  }
}

async function post(name: string, fetcher: FetchLike, url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown> {
  let res;
  try {
    res = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ProviderError(name, err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network");
  }
  if (!res.ok) throw new ProviderError(name, res.status);
  try {
    return JSON.parse(await res.text());
  } catch {
    throw new ProviderError(name, "network");
  }
}

/** Gemini Interactions API: the legacy site's first choice. */
export function interactionText(data: unknown): string | null {
  const d = data as { output_text?: unknown; steps?: unknown } | null;
  if (typeof d?.output_text === "string" && d.output_text.trim()) return d.output_text.trim();
  const parts: string[] = [];
  for (const step of Array.isArray(d?.steps) ? d.steps : []) {
    if ((step as { type?: string })?.type !== "model_output") continue;
    const content = (step as { content?: unknown }).content;
    for (const item of Array.isArray(content) ? content : []) {
      const i = item as { type?: string; text?: unknown };
      if (i.type === "text" && typeof i.text === "string") parts.push(i.text);
    }
  }
  return parts.join("").trim() || null;
}

export class GeminiInteractions implements LlmProvider {
  readonly name = "gemini";
  constructor(
    private readonly key: string,
    private readonly model: string,
    private readonly fetcher: FetchLike,
  ) {}
  async complete({ system, history, message }: CompletionRequest) {
    const conversation = [...history, { role: "user" as const, content: message }]
      .map((m) => `${m.role === "assistant" ? "Kaitlyn" : "User"}: ${m.content}`)
      .join("\n\n");
    const data = await post(
      this.name,
      this.fetcher,
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      { "x-goog-api-key": this.key },
      { model: this.model, system_instruction: system, input: conversation, generation_config: { temperature: TEMPERATURE, max_output_tokens: MAX_TOKENS }, store: false },
      20_000,
    );
    return interactionText(data);
  }
}

/** OpenRouter and Mistral both speak the OpenAI chat-completions format. */
export class OpenAiCompatible implements LlmProvider {
  constructor(
    readonly name: string,
    private readonly url: string,
    private readonly key: string,
    private readonly model: string,
    private readonly fetcher: FetchLike,
    private readonly extraHeaders: Record<string, string> = {},
  ) {}
  async complete({ system, history, message }: CompletionRequest) {
    const data = (await post(
      this.name,
      this.fetcher,
      this.url,
      { Authorization: `Bearer ${this.key}`, ...this.extraHeaders },
      { model: this.model, messages: [{ role: "system", content: system }, ...history, { role: "user", content: message }], temperature: TEMPERATURE, max_tokens: MAX_TOKENS },
      15_000,
    )) as { choices?: { message?: { content?: unknown } }[] };
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  }
}

/** Providers that have a key, in priority order. An empty list means Kaitlyn is not configured. */
export function createProviders(cfg: ProviderConfig, fetcher: FetchLike = fetch as unknown as FetchLike): LlmProvider[] {
  const out: LlmProvider[] = [];
  const gemini = cfg.GEMINI_API_KEY ?? cfg.GOOGLE_API_KEY;
  if (gemini) out.push(new GeminiInteractions(gemini, cfg.GEMINI_MODEL, fetcher));
  if (cfg.OPENROUTER_API_KEY) {
    out.push(
      new OpenAiCompatible("openrouter", "https://openrouter.ai/api/v1/chat/completions", cfg.OPENROUTER_API_KEY, cfg.OPENROUTER_MODEL, fetcher, {
        "HTTP-Referer": cfg.APP_URL,
        "X-Title": "The Modern Pedagogues - Kaitlyn",
      }),
    );
  }
  if (cfg.MISTRAL_API_KEY) {
    out.push(new OpenAiCompatible("mistral", "https://api.mistral.ai/v1/chat/completions", cfg.MISTRAL_API_KEY, cfg.MISTRAL_MODEL, fetcher));
  }
  return out;
}
