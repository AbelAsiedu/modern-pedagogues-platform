import Link from "next/link";
import { getSession, getSiteText } from "@/server/context";
import { MobileMenu } from "./MobileMenu";

const NAV = [
  { href: "/services", key: "nav.services" },
  { href: "/tutors", key: "nav.tutors" },
  { href: "/resources", key: "nav.resources" },
  { href: "/pricing", key: "nav.pricing" },
  { href: "/about", key: "nav.about" },
  { href: "/contact", key: "nav.contact" },
] as const;

function Monogram() {
  return <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-navy text-base font-bold text-gold shadow-sm">T</span>;
}

export async function Header() {
  const [session, t] = await Promise.all([getSession().catch(() => null), getSiteText()]);
  const links = [
    ...NAV.map((n) => ({ href: n.href, label: t.text(n.key) })),
    session ? { href: "/account", label: t.text("nav.account") } : { href: "/login", label: t.text("nav.signin") },
  ];
  const cta = { href: t.whatsapp(`Hello ${t.biz.name}, I would like to request a tutor for my ward.`), label: t.text("nav.cta") };
  return (
    <header className="sticky top-0 z-40 border-b border-navy/10 bg-cream/80 backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight text-navy">
          <Monogram />
          <span>{t.biz.name}</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-x-1 text-sm font-medium md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-2 transition-colors hover:bg-navy/5 hover:text-navy">
              {l.label}
            </Link>
          ))}
          <a href={cta.href} className="ml-2 rounded-full bg-navy px-5 py-2.5 text-cream transition-transform hover:scale-[1.03] hover:bg-navy/90">
            {cta.label}
          </a>
        </nav>
        <MobileMenu links={links} cta={cta} />
      </div>
    </header>
  );
}

export async function Footer() {
  const t = await getSiteText();
  const b = t.biz;
  return (
    <footer className="relative mt-24 overflow-hidden bg-navy text-cream">
      <div className="blob -bottom-32 left-1/3 h-72 w-72 bg-gold/30" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-3 text-lg font-semibold">
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-gold text-base font-bold text-navy">T</span>
            {b.name}
          </p>
          <p className="gradient-text mt-4 text-xl font-semibold">{b.motto}</p>
          <p className="mt-3 max-w-md text-sm text-cream/70">{t.text("footer.blurb")}</p>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-gold">{t.text("footer.contact_heading")}</p>
          <p className="mt-3">
            <a className="underline decoration-gold underline-offset-4" href={`mailto:${b.email}`}>{b.email}</a>
          </p>
          <p className="mt-2">
            Phone / WhatsApp: <a href={`tel:${b.phoneTel}`}>{b.phoneDisplay}</a>
          </p>
          <p className="mt-2">{b.momoNetwork}: {b.momoNumber}</p>
        </div>
        <nav aria-label="Legal" className="text-sm">
          <p className="font-semibold text-gold">{t.text("footer.policies_heading")}</p>
          <ul className="mt-3 space-y-2">
            <li><Link href="/terms" className="hover:text-gold">Terms of service</Link></li>
            <li><Link href="/privacy" className="hover:text-gold">Privacy policy</Link></li>
            <li><Link href="/refunds" className="hover:text-gold">Refunds and cancellations</Link></li>
            <li><Link href="/resources/standards" className="hover:text-gold">Resource quality standard</Link></li>
          </ul>
        </nav>
      </div>
      <p className="relative border-t border-cream/10 py-5 text-center text-xs text-cream/60">
        © {new Date().getFullYear()} {b.name}. All rights reserved.
      </p>
    </footer>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-navy focus:px-3 focus:py-2 focus:text-cream">
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}

/** The banner at the top of inner pages: animated gradient, staggered entrance. */
export function Hero({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <section className="mesh relative isolate overflow-hidden text-cream">
      <div className="blob -right-16 -top-16 h-64 w-64 bg-gold/50" aria-hidden="true" />
      <div className="blob -bottom-20 left-1/4 h-72 w-72 bg-sky-500/30 [animation-delay:-7s]" aria-hidden="true" />
      <div className="grid-fade absolute inset-0 -z-10" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <p className="rise text-sm font-semibold uppercase tracking-[0.22em] text-gold">{kicker}</p>
        <h1 style={{ "--d": "100ms" } as React.CSSProperties} className="rise mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">{title}</h1>
        {children ? <div style={{ "--d": "220ms" } as React.CSSProperties} className="rise mt-6 max-w-2xl text-lg leading-8 text-cream/80">{children}</div> : null}
      </div>
    </section>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-4 [&_p]:leading-7 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:underline [&_a]:decoration-gold [&_a]:underline-offset-4">
      {children}
    </div>
  );
}
