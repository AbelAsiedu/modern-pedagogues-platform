import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { getSiteText } from "@/server/context";

// The business name and descriptions are editable by the administrator, so this is read per request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getSiteText();
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: t.biz.name, template: `%s | ${t.biz.name}` },
    description: t.text("seo.home.description"),
    ...(t.image("site.favicon") ? { icons: { icon: t.image("site.favicon"), apple: t.image("site.favicon") } } : {}),
    ...(t.image("site.share_image")
      ? { openGraph: { images: [{ url: t.image("site.share_image"), alt: t.imageAlt("site.share_image") || t.biz.name }] }, twitter: { card: "summary_large_image" as const, images: [t.image("site.share_image")] } }
      : {}),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
