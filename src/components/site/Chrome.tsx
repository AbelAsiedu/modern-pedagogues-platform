import Link from "next/link";
import { SITE, whatsappLink } from "@/lib/site";

const NAV = [
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function Header() {
  return (
    <header className="border-b border-navy/10 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-navy">
          {SITE.name}
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-gold">
              {n.label}
            </Link>
          ))}
          <a
            href={whatsappLink("Hello TMP, I would like to request a tutor for my ward.")}
            className="rounded-full bg-navy px-4 py-2 text-cream hover:bg-navy/90"
          >
            Request a tutor
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-navy/10 bg-cream-deep">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-3">
        <div>
          <p className="font-semibold">{SITE.name}</p>
          <p className="mt-2 text-sm">{SITE.motto}</p>
          <p className="mt-2 text-sm">Educational services in {SITE.country} since {SITE.founded}.</p>
        </div>
        <div className="text-sm">
          <p className="font-semibold">Contact</p>
          <p className="mt-2">
            <a className="underline decoration-gold underline-offset-4" href={`mailto:${SITE.email}`}>
              {SITE.email}
            </a>
          </p>
          <p className="mt-1">
            Phone / WhatsApp: <a href={`tel:${SITE.phoneTel}`}>{SITE.phoneDisplay}</a>
          </p>
        </div>
        <nav aria-label="Legal" className="text-sm">
          <p className="font-semibold">Policies</p>
          <ul className="mt-2 space-y-1">
            <li><Link href="/terms">Terms of service</Link></li>
            <li><Link href="/privacy">Privacy policy</Link></li>
            <li><Link href="/refunds">Refunds and cancellations</Link></li>
          </ul>
        </nav>
      </div>
      <p className="border-t border-navy/10 py-4 text-center text-xs">
        © {new Date().getFullYear()} {SITE.name}. All rights reserved.
      </p>
    </footer>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-navy focus:px-3 focus:py-2 focus:text-cream">
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}

export function Hero({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <section className="bg-navy text-cream">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-gold">{kicker}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
        {children ? <div className="mt-5 max-w-2xl text-lg text-cream/85">{children}</div> : null}
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
