export type Testimonial = { quote: string; by: string };

/** Parse "quote | name, role" lines. Lines without a quote are ignored; a missing name becomes "A TMP family". */
export function parseTestimonials(lines: string[]): Testimonial[] {
  return lines
    .map((l) => {
      const [quote, ...rest] = l.split("|");
      return { quote: (quote ?? "").trim(), by: rest.join("|").trim() || "A TMP family" };
    })
    .filter((t) => t.quote.length > 0);
}
