export const dynamic = "force-dynamic";

import type { MetadataRoute } from "next";

const PAGES = ["", "/services", "/tutors", "/tutors/apply", "/shop", "/pricing", "/about", "/contact", "/terms", "/privacy", "/refunds"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return PAGES.map((p) => ({ url: `${base}${p}`, changeFrequency: "monthly", priority: p === "" ? 1 : 0.6 }));
}
