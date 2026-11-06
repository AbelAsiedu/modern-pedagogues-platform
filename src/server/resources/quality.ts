import { z } from "zod";
import { parseDecimal, MoneyError } from "../../lib/money";

// ---------- kinds ----------

export const RESOURCE_KINDS = ["BOOK", "COURSE", "STUDY_GUIDE", "WORKSHEET", "PAST_QUESTIONS", "LESSON_PLAN", "OTHER"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const KIND_LABELS: Readonly<Record<ResourceKind, string>> = {
  BOOK: "Book",
  COURSE: "Course (PDF)",
  STUDY_GUIDE: "Study guide",
  WORKSHEET: "Worksheets",
  PAST_QUESTIONS: "Past questions with answers",
  LESSON_PLAN: "Lesson plans",
  OTHER: "Other",
};
/** Shortest acceptable PDF for each kind. A "course" or "book" that is a few pages long is not one. */
export const MIN_PAGES: Readonly<Record<ResourceKind, number>> = { BOOK: 15, COURSE: 15, STUDY_GUIDE: 15, WORKSHEET: 4, PAST_QUESTIONS: 4, LESSON_PLAN: 3, OTHER: 4 };
const NEEDS_CONTENTS: readonly ResourceKind[] = ["BOOK", "COURSE", "STUDY_GUIDE"];

export const MIN_PAID_PRICE_CREATOR = 500n; // GH₵ 5.00: below this, payment costs eat the sale
export const MIN_PRICE = 100n; // GH₵ 1.00 (staff)
export const MAX_PRICE = 500_000n; // GH₵ 5,000.00
export const COVER_MIN_WIDTH = 600;
export const COVER_MIN_HEIGHT = 400;
export const DECLARATION_VERSION = 1;

/** The promises a creator makes when submitting. Shown next to the tick-box and stored with the date and version. */
export const DECLARATIONS: readonly string[] = [
  "This is my own original work, or I hold the written right to sell and share every part of it (text, images, past-paper extracts and fonts).",
  "It contains no personal information about children or other people, and no advertising, contact details or links that take buyers away from TMP.",
  "The facts, worked answers and curriculum claims in it are, to the best of my knowledge, correct and suitable for the level I have stated.",
  "I accept the Creator Terms, including TMP's right to review it, to ask for changes, and to remove it if there is a rights or safety problem.",
];

// ---------- contact-detail guard (keeps sales on the platform) ----------

/** Emails, links and phone numbers (a "+" or leading-0 number). Years such as "BECE 2019-2023" are not phone numbers. */
export function containsContactDetails(text: string): boolean {
  return /[^\s@]+@[^\s@]+/.test(text) || /https?:\/\/|www\./i.test(text) || /(\+\d[\d\s().-]{7,}\d|\b0\d[\d\s().-]{7,}\d)/.test(text);
}
const clean = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (maximum ${max} characters).`)
    .refine((v) => !containsContactDetails(v), `${label} must not contain email addresses, links or phone numbers.`);

const lines = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []);
const list = (max: number, itemMax: number) => z.array(z.string().trim().min(1).max(itemMax)).max(max).transform((a) => [...new Set(a)]);

// ---------- listing input (what a creator or staff member types) ----------

export const listingInput = z.object({
  title: clean("Title", 120).min(3, "Enter a title."),
  summary: clean("Summary", 240),
  description: clean("Description", 4000).default(""),
  kind: z.enum(RESOURCE_KINDS, "Choose what kind of resource this is."),
  subject: clean("Subject", 60).default(""),
  levelKeys: z.preprocess((v) => (Array.isArray(v) ? v : []), list(10, 40)),
  curriculumKeys: z.preprocess((v) => (Array.isArray(v) ? v : []), list(10, 40)),
  language: clean("Language", 30).default("English"),
  authorName: clean("Author name", 80).default(""),
  outcomes: z.preprocess(lines, list(8, 160).pipe(z.array(clean("Each learning outcome", 160)))),
  audience: clean("Who it is for", 300).default(""),
  tableOfContents: clean("Contents", 3000).default(""),
  isFree: z.boolean().default(false),
  price: z.string().trim().default(""),
  coverPath: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().regex(/^\/media\/[0-9a-f-]{36}\.(jpg|png|webp)$/, "Choose a picture from the list.").nullable()),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});
export type ListingInput = z.input<typeof listingInput>;
export type Listing = z.output<typeof listingInput>;

/** Price in pesewas: 0 for free. `creator` applies the higher floor that protects sellers from payment costs. */
export function priceFrom(listing: Pick<Listing, "isFree" | "price">, creator: boolean): { ok: true; pesewas: bigint } | { ok: false; message: string } {
  if (listing.isFree) return { ok: true, pesewas: 0n };
  try {
    const m = parseDecimal(listing.price, "GHS");
    const min = creator ? MIN_PAID_PRICE_CREATOR : MIN_PRICE;
    if (m.amount < min || m.amount > MAX_PRICE) {
      return { ok: false, message: creator ? "A paid resource must cost between GH₵ 5 and GH₵ 5,000, or be marked free." : "Price must be between GH₵ 1 and GH₵ 5,000." };
    }
    return { ok: true, pesewas: m.amount };
  } catch (e) {
    if (e instanceof MoneyError) return { ok: false, message: "Enter the price in cedis, for example 25 or 25.50." };
    throw e;
  }
}

// ---------- readiness: what must be true before a resource can be submitted ----------

export type ReadinessInput = {
  title: string;
  summary: string;
  description: string;
  kind: ResourceKind;
  subject: string;
  levelKeys: readonly string[];
  outcomes: readonly string[];
  audience: string;
  tableOfContents: string;
  authorName: string;
  coverPath: string | null;
  cover: { width: number; height: number } | null;
  file: { pages: number; problems: readonly string[] } | null;
  declared: boolean;
};

/** Human-readable list of what is still missing. Empty means the listing can be submitted for review. */
export function readiness(l: ReadinessInput): string[] {
  const out: string[] = [];
  if (l.title.trim().length < 8) out.push("Give it a clear title of at least 8 characters.");
  if (l.summary.trim().length < 60) out.push("Write a summary of 60 to 240 characters that says what the buyer gets.");
  if (l.description.trim().length < 300) out.push("Write a description of at least 300 characters: what is inside, how to use it, and why it is worth it.");
  if (!l.subject.trim()) out.push("Say which subject it covers.");
  if (l.levelKeys.length === 0) out.push("Choose at least one level (for example JHS or SHS).");
  if (l.outcomes.length < 3) out.push("List at least 3 learning outcomes (what the learner will be able to do).");
  else if (l.outcomes.some((o) => o.trim().length < 15)) out.push("Make each learning outcome a full sentence of at least 15 characters.");
  if (l.audience.trim().length < 20) out.push("Say who it is for and what they should already know.");
  if (NEEDS_CONTENTS.includes(l.kind) && l.tableOfContents.trim().length < 60) out.push("Add a table of contents (chapters or units) so buyers can see the structure.");
  if (!l.authorName.trim()) out.push("Add the author name to show on the listing.");
  if (!l.coverPath || !l.cover) out.push("Add a cover picture.");
  else if (l.cover.width < COVER_MIN_WIDTH || l.cover.height < COVER_MIN_HEIGHT) out.push(`The cover picture must be at least ${COVER_MIN_WIDTH}×${COVER_MIN_HEIGHT} pixels.`);
  if (!l.file) out.push("Upload the PDF.");
  else {
    out.push(...l.file.problems);
    const min = MIN_PAGES[l.kind];
    if (l.file.pages > 0 && l.file.pages < min) out.push(`A ${KIND_LABELS[l.kind].toLowerCase()} needs at least ${min} pages; this PDF has ${l.file.pages}.`);
  }
  if (!l.declared) out.push("Tick the declarations to confirm the work is yours and meets the rules.");
  return out;
}

// ---------- the reviewer's rubric ----------

export const RUBRIC_VERSION = 1;
export const SCORE_LABELS = ["Unacceptable", "Weak", "Adequate", "Good", "Excellent"] as const;
/** Every applicable criterion must reach this score. */
export const CRITERION_PASS = 3;
/** And the average across applicable criteria must reach this, so approved work is good throughout and excellent in places. */
export const AVERAGE_PASS = 3.25;

export type Criterion = { key: string; label: string; gate: boolean; paidOnly?: boolean; question: string; excellent: string; unacceptable: string };

/**
 * The standard every resource is judged against. Three "gates" (accuracy, originality and rights, safety) can never
 * be traded off against strengths elsewhere. Scores run 0 to 4; 3 ("Good") is the minimum on every criterion.
 */
export const CRITERIA: readonly Criterion[] = [
  { key: "accuracy", label: "Accuracy and curriculum fit", gate: true, question: "Are the facts, worked solutions and answers correct, and does the content match the stated level and curriculum?", excellent: "Checked line by line: no errors found; maps clearly to the curriculum's objectives.", unacceptable: "Factual or mathematical errors, or content from the wrong level." },
  { key: "originality", label: "Originality and rights", gate: true, question: "Is it the creator's own work, or properly licensed? No copied textbooks, pirated past papers, or uncredited images?", excellent: "Clearly original, with any third-party material credited and licensed.", unacceptable: "Copied or unlicensed material." },
  { key: "safety", label: "Safety and privacy", gate: true, question: "Is it free of personal data about children, harmful or inappropriate content, advertising, and links that take buyers away from TMP?", excellent: "Nothing of concern; links (if any) go only to reputable educational sources.", unacceptable: "Personal data, harmful content, or unsafe links." },
  { key: "structure", label: "Learning outcomes and structure", gate: false, question: "Are there clear learning outcomes, a sensible order, and a progression from simple to demanding?", excellent: "Outcomes are specific and each section demonstrably builds toward them.", unacceptable: "No discernible purpose or order." },
  { key: "pedagogy", label: "Teaching quality", gate: false, question: "Does it explain, not just state: worked examples, practice questions, answers or marking guidance, and ways to check understanding?", excellent: "Clear explanations, varied worked examples, graded practice and full answers.", unacceptable: "Bare facts or questions with no help to learn." },
  { key: "presentation", label: "Language and presentation", gate: false, question: "Is the writing clear and correct for the age group, and is the layout readable (type size, spacing, consistent headings, legible diagrams)?", excellent: "Polished, professional, and a pleasure to read.", unacceptable: "Hard to read or riddled with mistakes." },
  { key: "inclusion", label: "Age-appropriateness and inclusion", gate: false, question: "Is the tone, difficulty and context right for the learners, and respectful of all backgrounds, including Ghanaian examples where relevant?", excellent: "Well pitched, relevant to Ghanaian learners, inclusive.", unacceptable: "Inappropriate for the age group or stereotyping." },
  { key: "value", label: "Value for the price", gate: false, paidOnly: true, question: "Given the price, is there enough depth, originality and polish that a parent would feel the money was well spent?", excellent: "Clearly worth more than it costs.", unacceptable: "Thin for the price asked." },
];

export type Scores = Readonly<Record<string, number>>;

export type RubricResult = { applicable: Criterion[]; missing: string[]; failing: string[]; mean: number; approvable: boolean };

export function applicableCriteria(isPaid: boolean): Criterion[] {
  return CRITERIA.filter((c) => !c.paidOnly || isPaid);
}

export function evaluateRubric(scores: Scores, isPaid: boolean): RubricResult {
  const applicable = applicableCriteria(isPaid);
  const missing: string[] = [];
  const failing: string[] = [];
  let sum = 0;
  for (const c of applicable) {
    const v = scores[c.key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 4) {
      missing.push(c.label);
      continue;
    }
    sum += v;
    if (v < CRITERION_PASS) failing.push(c.label);
  }
  const mean = applicable.length ? sum / applicable.length : 0;
  return { applicable, missing, failing, mean, approvable: missing.length === 0 && failing.length === 0 && mean >= AVERAGE_PASS };
}
