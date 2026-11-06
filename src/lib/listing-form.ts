import type { FieldSpec } from "@/components/forms/ActionForm";
import { KIND_LABELS, RESOURCE_KINDS } from "@/server/resources/quality";

/** Offered as suggestions so listings use the same spelling and the Subject filter stays tidy. Anything else can still be typed. */
export const COMMON_SUBJECTS = [
  "Mathematics", "English Language", "Integrated Science", "Social Studies", "Science", "Physics", "Chemistry", "Biology",
  "Computing (ICT)", "Religious and Moral Education", "French", "Ghanaian Language", "Career Technology", "Creative Arts", "Economics",
  "Geography", "History", "Government", "Literature in English", "Accounting", "Business Management", "General Knowledge", "Exam Preparation",
] as const;

export type ListingDefaults = {
  title: string;
  summary: string;
  description: string;
  kind: string;
  subject: string;
  levelKeys: readonly string[];
  curriculumKeys: readonly string[];
  language: string;
  authorName: string;
  outcomes: readonly string[];
  audience: string;
  tableOfContents: string;
  priceMinor: bigint;
  coverPath: string | null;
  sortOrder?: number;
  isPublished?: boolean;
};

/** The listing form, shared by creators and staff. `staff` adds ordering and the published switch and a lower price floor. */
export function listingFields(opts: {
  levels: readonly { key: string; name: string }[];
  curricula: readonly { key: string; name: string }[];
  pictures: readonly { value: string; label: string }[];
  p?: ListingDefaults;
  staff?: boolean;
  priceText?: (p: bigint) => string;
}): FieldSpec[] {
  const { p } = opts;
  const covers = [{ value: "", label: "No picture yet" }, ...opts.pictures];
  if (p?.coverPath && !covers.some((c) => c.value === p.coverPath)) covers.unshift({ value: p.coverPath, label: `${p.coverPath} (missing)` });
  const free = p ? p.priceMinor === 0n : false;
  const fields: FieldSpec[] = [
    { name: "title", label: "Title", required: true, defaultValue: p?.title ?? "", hint: "Clear and specific, for example “JHS Integrated Science: Complete Course”." },
    { name: "kind", label: "What is it?", type: "select", required: true, options: RESOURCE_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })), defaultValue: p?.kind ?? "STUDY_GUIDE" },
    { name: "subject", label: "Subject", required: true, defaultValue: p?.subject ?? "", list: COMMON_SUBJECTS, hint: "Pick one from the list or type your own. Buyers can filter by subject, so use the usual name." },
    { name: "levelKeys", label: "Levels", type: "checkboxes", required: true, options: opts.levels.map((l) => ({ value: l.key, label: l.name })), defaultValue: (p?.levelKeys ?? []).join(",") },
    { name: "curriculumKeys", label: "Curricula", type: "checkboxes", options: opts.curricula.map((c) => ({ value: c.key, label: c.name })), defaultValue: (p?.curriculumKeys ?? []).join(",") },
    { name: "language", label: "Language", defaultValue: p?.language ?? "English" },
    { name: "authorName", label: "Author name shown on the listing", defaultValue: p?.authorName ?? "" },
    { name: "summary", label: "Short summary (60 to 240 characters)", type: "textarea", rows: 2, required: true, defaultValue: p?.summary ?? "", hint: "What the buyer gets, in one or two sentences. Shown on cards and read by Kaitlyn." },
    { name: "description", label: "Full description (at least 300 characters)", type: "textarea", rows: 8, defaultValue: p?.description ?? "", hint: "What is inside, how to use it, and why it is worth it. Plain text. No email addresses, links or phone numbers." },
    { name: "outcomes", label: "Learning outcomes (at least 3, one per line)", type: "textarea", rows: 5, defaultValue: (p?.outcomes ?? []).join("\n"), hint: "Start each with a verb: “Solve…”, “Explain…”, “Write…”. Each should be a full sentence." },
    { name: "audience", label: "Who it is for and what they should already know", type: "textarea", rows: 2, defaultValue: p?.audience ?? "" },
    { name: "tableOfContents", label: "Contents (chapters or units)", type: "textarea", rows: 6, defaultValue: p?.tableOfContents ?? "", hint: "Required for books, courses and study guides." },
    { name: "isFree", label: "This resource is free to download", type: "checkbox", defaultValue: free },
    { name: "price", label: "Price (GH₵), if not free", defaultValue: p && !free ? opts.priceText?.(p.priceMinor) ?? "" : "", hint: opts.staff ? "Between 1 and 5,000." : "Between 5 and 5,000. You receive 70% of each sale." },
    { name: "coverPath", label: "Cover picture", type: "select", options: covers, defaultValue: p?.coverPath ?? "", hint: "At least 600×400 pixels. Upload pictures first, then pick one here." },
  ];
  if (opts.staff) {
    fields.push({ name: "sortOrder", label: "Order (lowest first)", type: "number", defaultValue: p?.sortOrder ?? 0 });
    fields.push({ name: "isPublished", label: "Published on the Resources page", type: "checkbox", defaultValue: p?.isPublished ?? false });
  }
  return fields;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const all = (f: FormData, k: string) => f.getAll(k).filter((x): x is string => typeof x === "string");

/** Reads the listing form back into the shape the services validate. */
export function listingFromForm(form: FormData, staff = false) {
  return {
    title: str(form, "title"),
    summary: str(form, "summary"),
    description: str(form, "description"),
    kind: str(form, "kind"),
    subject: str(form, "subject"),
    levelKeys: all(form, "levelKeys"),
    curriculumKeys: all(form, "curriculumKeys"),
    language: str(form, "language") || "English",
    authorName: str(form, "authorName"),
    outcomes: str(form, "outcomes"),
    audience: str(form, "audience"),
    tableOfContents: str(form, "tableOfContents"),
    isFree: form.get("isFree") === "on",
    price: str(form, "price"),
    coverPath: str(form, "coverPath"),
    ...(staff ? { sortOrder: str(form, "sortOrder") || "0", isPublished: form.get("isPublished") === "on" } : {}),
  };
}
