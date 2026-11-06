import { SITE } from "../../lib/site";

/**
 * Input rules for Kaitlyn. Pure functions, no I/O.
 *
 * The legacy site used a substring block-list ("kill", "hate", "abuse", ...). That blocked ordinary questions
 * ("skills", "whatever") and hid genuine safeguarding questions from parents. This version matches whole words
 * only, keeps the terms that are clearly unsafe, and answers self-harm with care rather than a bare refusal.
 * The model itself is also instructed to refuse harmful requests, so this is one layer of several.
 */

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_HISTORY_TURNS = 8;
const MAX_TURN_CHARS = 2000;

export const SAFE_BLOCK_TEXT = "Sorry, I can't help with that.";

export const SELF_HARM_TEXT =
  "I'm really sorry you're going through this. I'm an AI assistant and can't give the help you deserve. If you or someone you know might be in danger, please call your local emergency number now (112 in Ghana) or tell a trusted adult or a doctor straight away. You do not have to face this alone.";

export const fallbackText = () =>
  `I'm sorry, I can't answer that right now. Please contact our team on WhatsApp or phone (${SITE.phoneDisplay}) or email ${SITE.email}, and we will help you.`;

const BLOCKED = [
  /\b(kill|murder|stab|shoot)(s|ing)?\s+(a\s+|an\s+|the\s+|my\s+|his\s+|her\s+|someone|somebody|people|him|her|them)\b/i,
  /\b(make|build|making|building)\s+(a\s+)?(bomb|explosive|weapon)s?\b/i,
  /\bbomb\s+(making|recipe|instructions)\b/i,
  /\b(porn|pornography|nsfw|xxx|erotic)\b/i,
  /\brap(e|ing)\s+(someone|a\s|her|him|them)\b/i,
  /\bhow\s+to\s+(hack|steal|cheat\s+on\s+(the\s+)?(bece|wassce|exam))/i,
];

const SELF_HARM = [/\bsuicid(e|al)\b/i, /\bkill\s+myself\b/i, /\bend\s+my\s+life\b/i, /\bself[-\s]?harm\b/i, /\bhurt\s+myself\b/i, /\bwant\s+to\s+die\b/i];

export type PromptCheck = "ok" | "blocked" | "self_harm";

export function checkPrompt(text: string): PromptCheck {
  const t = text.normalize("NFKC");
  if (SELF_HARM.some((r) => r.test(t))) return "self_harm";
  if (BLOCKED.some((r) => r.test(t))) return "blocked";
  return "ok";
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Browser-supplied history is untrusted: keep only well-formed user/assistant turns, bounded in number and size. */
export function sanitizeHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  const out: ChatTurn[] = [];
  for (const item of history) {
    if (typeof item !== "object" || item === null) continue;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = content.trim().slice(0, MAX_TURN_CHARS);
    if (text) out.push({ role, content: text });
  }
  return out.slice(-MAX_HISTORY_TURNS);
}
