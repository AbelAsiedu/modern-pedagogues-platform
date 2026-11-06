import { PageShell } from "@/components/site/Chrome";

// Page text is admin-editable and read from the database, so these pages must not be prerendered at build time.
export const dynamic = "force-dynamic";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
