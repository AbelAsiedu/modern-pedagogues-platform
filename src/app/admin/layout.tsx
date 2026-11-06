import type { Metadata } from "next";
import { logoutAction } from "@/app/(site)/auth-actions";
import { AdminNav, type NavGroup } from "@/components/admin/AdminNav";
import { requireSession } from "@/server/context";
import { isMediaStaff } from "@/server/media/service";
import { can } from "@/server/permissions/authorize";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | TMP Admin" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession("/admin");
  const a = s.actor;
  type Item = NavGroup["links"][number] & { show: boolean };
  const all: { title: string; links: Item[] }[] = [
    {
      title: "Overview",
      links: [{ href: "/admin", label: "Dashboard", icon: "dashboard", show: true }],
    },
    {
      title: "People",
      links: [
        { href: "/admin/users", label: "Users and roles", icon: "users", show: can(a, "users.view") },
        { href: "/admin/tutors", label: "Tutors", icon: "tutors", show: can(a, "tutors.review_applications") },
      ],
    },
    {
      title: "Website",
      links: [
        { href: "/admin/banners", label: "Home slideshow", icon: "slideshow", show: can(a, "content.manage_site") },
        { href: "/admin/content", label: "Site text", icon: "text", show: can(a, "content.manage_site") },
        { href: "/admin/media", label: "Media library", icon: "media", show: isMediaStaff(a) },
        { href: "/admin/assistant", label: "Kaitlyn", icon: "chat", show: can(a, "assistant.manage_knowledge") },
      ],
    },
    {
      title: "Marketplace",
      links: [
        { href: "/admin/shop", label: "Resources", icon: "book", show: can(a, "commerce.manage_products") },
        { href: "/admin/review", label: "Review queue", icon: "check", show: can(a, "marketplace.moderate") },
        { href: "/admin/creators", label: "Creators and payouts", icon: "pen", show: can(a, "finance.manage_payouts") || can(a, "marketplace.manage_creators") },
        { href: "/admin/orders", label: "Orders", icon: "receipt", show: can(a, "commerce.manage_orders") },
      ],
    },
    {
      title: "System",
      links: [{ href: "/admin/audit", label: "Audit log", icon: "list", show: can(a, "audit.view") }],
    },
  ];
  const groups: NavGroup[] = all
    .map((g) => ({ title: g.title, links: g.links.filter((l) => l.show).map((l) => ({ href: l.href, label: l.label, icon: l.icon })) }))
    .filter((g) => g.links.length > 0);
  // The Dashboard link is always present, so require at least one other area.
  if (groups.reduce((n, g) => n + g.links.length, 0) <= 1) notFound();
  return (
    <div className="admin-shell min-h-screen bg-[#f4f1e8]">
      <AdminNav
        groups={groups}
        signOut={
          <form action={logoutAction}>
            <button className="w-full rounded-xl border border-cream/25 px-3 py-2 text-left text-sm text-cream/85 hover:border-cream/60 hover:text-cream">Sign out</button>
          </form>
        }
      />
      <main className="admin-main lg:pl-64">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
