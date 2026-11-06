import Link from "next/link";
import { getSession, getSiteText } from "@/server/context";
import { Logo, SocialIcon, SiteIcon, Wave, type SiteIconName } from "./Brand";
import { MobileMenu } from "./MobileMenu";
import { SiteImage } from "./SiteImage";

const NAV = [
  { href: "/", key: "nav.home" },
  { href: "/about", key: "nav.about" },
  { href: "/services", key: "nav.services" },
  { href: "/tutors", key: "nav.tutors" },
  { href: "/resources", key: "nav.resources" },
  { href: "/pricing", key: "nav.pricing" },
  { href: "/contact", key: "nav.contact" },
] as const;

const SOCIALS = [
  ["facebook", "site.facebook", "Facebook"],
  ["instagram", "site.instagram", "Instagram"],
  ["x", "site.x", "X"],
  ["youtube", "site.youtube", "YouTube"],
  ["linkedin", "site.linkedin", "LinkedIn"],
  ["tiktok", "site.tiktok", "TikTok"],
] as const;

export async function Header() {
  const [session, t] = await Promise.all([getSession().catch(() => null), getSiteText()]);
  const links = [
    ...NAV.map((n) => ({ href: n.href, label: t.text(n.key) })),
    session ? { href: "/account", label: t.text("nav.account") } : { href: "/login", label: t.text("nav.signin") },
  ];
  const cta = { href: t.whatsapp(`Hello ${t.biz.name}, I would like to request a tutor for my ward.`), label: t.text("nav.cta") };
  return (
    <header className="sticky top-0 z-40 border-b border-cream/10 bg-navy/95 text-cream backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <Link href="/" aria-label={`${t.biz.name} home`} className="shrink-0">
          <Logo name={t.biz.name} imagePath={t.image("site.logo") || undefined} />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-x-0.5 text-sm font-medium lg:flex">
          {links.map((l) => (
            <Link key={l.href + l.label} href={l.href} className="rounded-full px-3 py-2 text-cream/90 transition-colors hover:bg-cream/10 hover:text-gold">
              {l.label}
            </Link>
          ))}
          <a href={cta.href} className="ml-3 rounded-full bg-gold px-5 py-2.5 font-semibold text-navy shadow-lg shadow-black/20 transition-transform hover:scale-[1.04] hover:bg-[#ffd04a]">
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
  const socials = SOCIALS.map(([kind, key, label]) => ({ kind, label, href: t.raw(key) })).filter((s) => s.href);
  return (
    <footer className="relative mt-24 overflow-hidden bg-navy text-cream">
      <div className="blob -bottom-32 left-1/3 h-72 w-72 bg-royal/60" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1.5fr_1fr_1.2fr_1fr]">
        <div>
          <Logo name={b.name} imagePath={t.image("site.logo") || undefined} />
          <p className="mt-5 max-w-xs text-sm leading-6 text-cream/70">{t.text("footer.blurb")}</p>
          <p className="mt-2 max-w-xs text-sm text-gold">{b.motto}</p>
          {socials.length > 0 ? (
            <ul className="mt-5 flex gap-2" aria-label="Social media">
              {socials.map((s) => (
                <li key={s.kind}>
                  <a href={s.href} aria-label={s.label} rel="noopener noreferrer" target="_blank" className="grid h-9 w-9 place-items-center rounded-full border border-cream/30 transition-colors hover:border-gold hover:bg-gold hover:text-navy">
                    <SocialIcon kind={s.kind} />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <nav aria-label="Footer" className="text-sm">
          <p className="font-semibold text-gold">Explore</p>
          <ul className="mt-3 space-y-2">
            {NAV.filter((n) => n.href !== "/").map((n) => (
              <li key={n.href}><Link href={n.href} className="text-cream/80 hover:text-gold">{t.text(n.key)}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="text-sm">
          <p className="font-semibold text-gold">{t.text("footer.contact_heading")}</p>
          <ul className="mt-3 space-y-2 text-cream/80">
            <li className="flex items-center gap-2"><SiteIcon name="mail" className="h-4 w-4 shrink-0 text-gold" /><a className="hover:text-gold" href={`mailto:${b.email}`}>{b.email}</a></li>
            <li className="flex items-center gap-2"><SiteIcon name="phone" className="h-4 w-4 shrink-0 text-gold" /><span>Phone / WhatsApp: <a className="hover:text-gold" href={`tel:${b.phoneTel}`}>{b.phoneDisplay}</a></span></li>
            <li className="pl-6">{b.momoNetwork}: {b.momoNumber}</li>
          </ul>
        </div>
        <nav aria-label="Legal" className="text-sm">
          <p className="font-semibold text-gold">{t.text("footer.policies_heading")}</p>
          <ul className="mt-3 space-y-2 text-cream/80">
            <li><Link href="/terms" className="hover:text-gold">Terms of service</Link></li>
            <li><Link href="/privacy" className="hover:text-gold">Privacy policy</Link></li>
            <li><Link href="/refunds" className="hover:text-gold">Refunds and cancellations</Link></li>
            <li><Link href="/resources/standards" className="hover:text-gold">Resource quality standard</Link></li>
          </ul>
        </nav>
      </div>
      <div className="relative border-t border-cream/10 px-6 py-5 text-center text-xs text-cream/60">
        <p className="text-sm font-semibold tracking-[0.2em] text-cream/80">{t.text("footer.tagline")}</p>
        <p className="mt-2">© {new Date().getFullYear()} {b.name}. All rights reserved.</p>
      </div>
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

/** The blue banner at the top of inner pages: serif headline, optional uploaded picture, curved edge. */
export async function Hero({
  kicker,
  title,
  imageKey,
  icon = "cap",
  children,
}: {
  kicker: string;
  title: string;
  /** Site images slot to show on the right (for example "page.services.image"). */
  imageKey?: string;
  icon?: SiteIconName;
  children?: React.ReactNode;
}) {
  const t = imageKey ? await getSiteText() : null;
  const withImage = Boolean(imageKey);
  return (
    <section className="mesh relative isolate overflow-hidden text-cream">
      <div className="blob -right-16 -top-16 h-64 w-64 bg-gold/40" aria-hidden="true" />
      <div className="blob -bottom-20 left-1/4 h-72 w-72 bg-sky-400/30 [animation-delay:-7s]" aria-hidden="true" />
      <div className="grid-fade absolute inset-0 -z-10" aria-hidden="true" />
      <div className={`mx-auto max-w-6xl px-6 pb-24 pt-14 md:pb-28 md:pt-20 ${withImage ? "grid items-center gap-10 md:grid-cols-[1.15fr_1fr]" : ""}`}>
        <div>
          <p className="rise text-xs font-bold uppercase tracking-[0.26em] text-gold">{kicker}</p>
          <h1 style={{ "--d": "100ms" } as React.CSSProperties} className="rise mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">{title}</h1>
          {children ? <div style={{ "--d": "220ms" } as React.CSSProperties} className="rise mt-6 max-w-2xl text-lg leading-8 text-cream/85">{children}</div> : null}
        </div>
        {withImage && t ? (
          <div style={{ "--d": "300ms" } as React.CSSProperties} className="rise relative hidden aspect-[5/4] md:block">
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-gold/40 via-transparent to-sky-300/30 blur-xl" aria-hidden="true" />
            <div className="absolute inset-0 overflow-hidden rounded-[1.75rem] ring-1 ring-cream/25 shadow-2xl shadow-black/40">
              <SiteImage path={t.image(imageKey!) || undefined} alt={t.imageAlt(imageKey!)} icon={icon} rounded="rounded-[1.75rem]" priority />
            </div>
          </div>
        ) : null}
      </div>
      <Wave />
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
