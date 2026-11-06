import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import { enforceRateLimit } from "../auth/rate-limit";
import type { Db } from "../db";
import { assistantChatLogs, siteSettings } from "../db/schema";
import type { SiteText } from "../content/site-content";
import { ValidationError } from "../errors";
import type { Logger } from "../logger";
import { assertCan, type Actor } from "../permissions/authorize";
import { checkPrompt, fallbackText, MAX_MESSAGE_CHARS, sanitizeHistory, SAFE_BLOCK_TEXT, SELF_HARM_TEXT, type ChatTurn } from "./guard";
import { buildKnowledge, buildSystemPrompt } from "./knowledge";
import { ProviderError, type LlmProvider } from "./providers";

export type Outcome = "answered" | "fallback" | "blocked" | "unavailable";

export type AssistantDeps = {
  db: Db;
  providers: readonly LlmProvider[];
  log: Logger;
  siteText: () => Promise<SiteText>;
  /** Maximum replies per day across all visitors. */
  dailyLimit: number;
};

export type AssistantReply = { answer: string; outcome: Outcome };

const ENABLED_KEY = "assistant.enabled";
const MAX_ANSWER_CHARS = 3000;
export const CHAT_LOG_RETENTION_DAYS = 90;

/** On unless an administrator has switched it off. It also needs at least one provider key to do anything. */
export async function isAssistantEnabled(db: Db): Promise<boolean> {
  try {
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, ENABLED_KEY));
    return (row?.value as { enabled?: boolean } | undefined)?.enabled !== false;
  } catch {
    return false;
  }
}

export async function isAssistantAvailable(db: Db, providers: readonly LlmProvider[]): Promise<boolean> {
  return providers.length > 0 && (await isAssistantEnabled(db));
}

export async function setAssistantEnabled(db: Db, actor: Actor | null, enabled: boolean, ip?: string | null) {
  assertCan(actor, "assistant.manage_knowledge");
  await db
    .insert(siteSettings)
    .values({ key: ENABLED_KEY, value: { enabled }, updatedById: actor.id })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: { enabled }, updatedById: actor.id, updatedAt: new Date() } });
  await recordAudit(db, { actorId: actor.id, action: enabled ? "assistant.enabled" : "assistant.disabled", entityType: "site_setting", entityId: ENABLED_KEY, ip });
}

async function log(deps: AssistantDeps, row: { outcome: Outcome; provider?: string; message: string; answer: string; latencyMs: number }) {
  try {
    await deps.db.insert(assistantChatLogs).values({ ...row, provider: row.provider ?? null });
  } catch (err) {
    deps.log.error({ err }, "could not record Kaitlyn chat");
  }
}

/**
 * Answer one visitor message. Order of checks: size, rate limits, unsafe-content guard, availability, then the
 * providers in turn. Provider failures never reach the visitor; they get the human-support fallback instead.
 */
export async function answerQuestion(
  deps: AssistantDeps,
  input: { message?: unknown; history?: unknown },
  ctx: { ip?: string | null } = {},
): Promise<AssistantReply> {
  const started = Date.now();
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) throw new ValidationError({ message: ["Type a question first."] });
  if (message.length > MAX_MESSAGE_CHARS) throw new ValidationError({ message: [`Please keep your message under ${MAX_MESSAGE_CHARS} characters.`] });

  await enforceRateLimit(deps.db, { key: `kaitlyn:ip:${ctx.ip ?? "unknown"}`, limit: 20, windowSeconds: 600 });
  await enforceRateLimit(deps.db, { key: "kaitlyn:global:day", limit: deps.dailyLimit, windowSeconds: 86_400 });

  const verdict = checkPrompt(message);
  if (verdict !== "ok") {
    const answer = verdict === "self_harm" ? SELF_HARM_TEXT : SAFE_BLOCK_TEXT;
    await log(deps, { outcome: "blocked", message, answer, latencyMs: Date.now() - started });
    return { answer, outcome: "blocked" };
  }

  const siteText = await deps.siteText();
  if (!(await isAssistantAvailable(deps.db, deps.providers))) {
    const answer = fallbackText(siteText.biz);
    await log(deps, { outcome: "unavailable", message, answer, latencyMs: Date.now() - started });
    return { answer, outcome: "unavailable" };
  }

  const history: ChatTurn[] = sanitizeHistory(input.history);
  const system = buildSystemPrompt(await buildKnowledge(deps.db, siteText), siteText.biz);
  for (const provider of deps.providers) {
    try {
      const text = await provider.complete({ system, history, message });
      if (text) {
        const answer = text.slice(0, MAX_ANSWER_CHARS);
        await log(deps, { outcome: "answered", provider: provider.name, message, answer, latencyMs: Date.now() - started });
        return { answer, outcome: "answered" };
      }
    } catch (err) {
      deps.log.warn({ provider: provider.name, err: err instanceof Error ? err.message : "error" }, "Kaitlyn provider failed");
    }
  }
  const answer = fallbackText(siteText.biz);
  await log(deps, { outcome: "fallback", message, answer, latencyMs: Date.now() - started });
  return { answer, outcome: "fallback" };
}

// ---------- admin views ----------

export async function assistantStats(db: Db, actor: Actor | null, days = 30) {
  assertCan(actor, "assistant.manage_knowledge");
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({ outcome: assistantChatLogs.outcome, n: count() })
    .from(assistantChatLogs)
    .where(gte(assistantChatLogs.createdAt, since))
    .groupBy(assistantChatLogs.outcome);
  const by = Object.fromEntries(rows.map((r) => [r.outcome, r.n])) as Partial<Record<Outcome, number>>;
  const total = rows.reduce((a, r) => a + r.n, 0);
  const unanswered = (by.fallback ?? 0) + (by.unavailable ?? 0);
  return { days, total, answered: by.answered ?? 0, blocked: by.blocked ?? 0, unanswered, unansweredRate: total ? unanswered / total : 0 };
}

/** Recent questions Kaitlyn could not answer: the best prompt for what knowledge to add next. */
export async function recentUnanswered(db: Db, actor: Actor | null, limit = 20) {
  assertCan(actor, "assistant.manage_knowledge");
  return db
    .select({ id: assistantChatLogs.id, createdAt: assistantChatLogs.createdAt, message: assistantChatLogs.message, outcome: assistantChatLogs.outcome })
    .from(assistantChatLogs)
    .where(and(sql`${assistantChatLogs.outcome} in ('fallback','unavailable')`))
    .orderBy(desc(assistantChatLogs.createdAt))
    .limit(Math.min(limit, 100));
}

/** Delete chat logs older than the retention period. Intended for a daily scheduled job. */
export async function purgeOldChatLogs(db: Db, days = CHAT_LOG_RETENTION_DAYS): Promise<number> {
  const res = await db.execute(sql`DELETE FROM assistant_chat_logs WHERE created_at < now() - make_interval(days => ${days}::int)`);
  return res.rowCount ?? 0;
}

export type ProviderTest = { provider: string; ok: boolean; detail: string };

function describeFailure(err: unknown): string {
  if (err instanceof ProviderError) {
    const st = err.status;
    if (st === "timeout") return "No answer within the time limit. Try again in a moment.";
    if (st === "network") return "Could not reach the provider from the server.";
    if (st === 400 || st === 401 || st === 403) return `The provider refused the request (HTTP ${st}). The key is probably wrong, expired, or not enabled for this model.`;
    if (st === 404) return "The provider does not know that model name (HTTP 404). Check the model setting.";
    if (st === 429) return "The provider says the free quota is used up or too many requests were sent (HTTP 429). Wait a while, or add another provider.";
    return `The provider returned an error (HTTP ${st}).`;
  }
  return "The provider replied with something unexpected.";
}

/** Send one tiny message to each configured provider so the administrator can see whether Kaitlyn can really answer. */
export async function testProviders(providers: readonly LlmProvider[], actor: Actor | null): Promise<ProviderTest[]> {
  assertCan(actor, "assistant.manage_knowledge");
  const out: ProviderTest[] = [];
  for (const p of providers) {
    try {
      const text = await p.complete({ system: "You are a connection test. Reply with the single word OK.", history: [], message: "Say OK." });
      out.push(text ? { provider: p.name, ok: true, detail: "Working: the provider answered." } : { provider: p.name, ok: false, detail: "The provider answered with nothing." });
    } catch (err) {
      out.push({ provider: p.name, ok: false, detail: describeFailure(err) });
    }
  }
  return out;
}
