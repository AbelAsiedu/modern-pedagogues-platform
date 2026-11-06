import type { Metadata } from "next";
import { getSiteText } from "./context";

export type SeoPage = "home" | "services" | "tutors" | "resources" | "pricing" | "about" | "contact";

/** Title and description for a main page, from the admin's "Page titles and search descriptions" text. */
export async function seoMetadata(page: SeoPage): Promise<Metadata> {
  const t = await getSiteText();
  const title = t.text(`seo.${page}.title`);
  const description = t.text(`seo.${page}.description`);
  return {
    title: page === "home" ? { absolute: title } : title,
    description,
    openGraph: {
      title,
      description,
      siteName: t.biz.name,
      type: "website",
      ...(t.image("site.share_image") ? { images: [{ url: t.image("site.share_image"), alt: t.imageAlt("site.share_image") || t.biz.name }] } : {}),
    },
  };
}
