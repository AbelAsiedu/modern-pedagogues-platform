import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/(site)/auth-actions";
import { requireSession } from "@/server/context";
import { can } from "@/server/permissions/authorize";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | TMP Admin" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession("/admin");
  const a = s.actor;
  const links = [
    { href: "/admin", label: "Dashboard", show: can(a, "users.view") || can(a, "content.manage_site") || can(a, "tutors.review_applications") },
    { href: "/admin/users", label: "Users", show: can(a, "users.view") },
    { href: "/admin/tutors", label: "Tutors", show: can(a, "tutors.review_applications") },
    { href: "/admin/banners", label: "Home banners", show: can(a, "content.manage_site") },
    { href: "/admin/content", label: "Site text", show: can(a, "content.manage_site") },
    { href: "/admin/audit", label: "Audit log", show: can(a, "audit.view") },
  ].filter((l) => l.show);
  if (links.length === 0) notFound();
  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-navy text-cream">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <Link href="/admin" className="font-semibold">TMP Admin</Link>
          <nav aria-label="Admin" className="flex flex-wrap items-center gap-5 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-gold">{l.label}</Link>
            ))}
            <Link href="/" className="opacity-80 hover:text-gold">View site</Link>
            <form action={logoutAction}>
              <button className="rounded-full border border-cream/40 px-3 py-1 hover:border-cream">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
