// Pure helper (no React, no server imports) so it can be unit-tested and used by the chat widget.
const SITE_PATHS = "services|tutors/apply|tutors|pricing|about|contact|terms|privacy|refunds|login|register";

/**
 * Turn the model's loose markdown into the small safe format RichText understands. Bullets and numbered
 * lines become "- " items, "#" headings become "##", and bare page paths such as /pricing become links.
 */
export function formatAnswer(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^\s*[*•]\s+/, "- ").replace(/^\s*\d+[.)]\s+/, "- ").replace(/^\s*#{1,6}\s+/, "## "))
    .join("\n")
    .replace(new RegExp(`(?<![\\[(\\w/])(/(?:${SITE_PATHS}))(?![\\w/-])`, "g"), "[$1]($1)");
}

