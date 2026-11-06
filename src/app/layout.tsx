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
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
