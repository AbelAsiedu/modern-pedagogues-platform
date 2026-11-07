import Link from "next/link";
import { SiteIcon } from "./Brand";
import { SiteImage } from "./SiteImage";
import { Reveal } from "./Reveal";
import type { SiteText } from "@/server/content/site-content";

/** "Title | Description" -> parts. A line without a bar is all title. */
export function splitFeature(line: string): { title: string; body: string } {
  const i = line.indexOf("|");
  return i < 0 ? { title: line.trim(), body: "" } : { title: line.slice(0, i).trim(), body: line.slice(i + 1).trim() };
}

/** A drawn graph (axes, a parabola, a sine wave, bars and a circle) shown until the administrator uploads a screenshot. */
export function GraphArt({ className = "" }: { className?: string }) {
  const grid = [];
  for (let x = 40; x <= 440; x += 40) grid.push(<line key={`v${x}`} x1={x} y1="20" x2={x} y2="260" />);
  for (let y = 20; y <= 260; y += 40) grid.push(<line key={`h${y}`} x1="40" y1={y} x2="440" y2={y} />);
  return (
    <svg viewBox="0 0 480 280" className={className} role="img" aria-label="An illustration of a graph with a curve, bars and a circle">
      <g stroke="rgba(255,255,255,0.14)" strokeWidth="1">{grid}</g>
      <g stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round">
        <line x1="40" y1="140" x2="448" y2="140" />
        <line x1="240" y1="14" x2="240" y2="266" />
      </g>
      <path d="M110 40 Q240 300 370 40" fill="none" stroke="#ffc20e" strokeWidth="4" strokeLinecap="round" />
      <path d="M40 140 C80 60 120 60 160 140 S240 220 280 140 S360 60 400 140 S430 190 440 170" fill="none" stroke="#7dd3fc" strokeWidth="3.5" strokeLinecap="round" />
      <g fill="rgba(255,255,255,0.85)">
        <rect x="64" y="214" width="22" height="46" rx="3" />
        <rect x="94" y="192" width="22" height="68" rx="3" />
        <rect x="124" y="226" width="22" height="34" rx="3" />
      </g>
      <circle cx="372" cy="196" r="44" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeDasharray="6 5" />
      <line x1="372" y1="196" x2="404" y2="164" stroke="#ffc20e" strokeWidth="3" strokeLinecap="round" />
      <circle cx="372" cy="196" r="4.5" fill="#ffc20e" />
      <circle cx="404" cy="164" r="4.5" fill="#ffc20e" />
    </svg>
  );
}

/** Opens the studio in a new tab. The address comes from the admin settings and must be https. */
export function OpenStudioButton({ url, label, className = "" }: { url: string; label: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 font-semibold text-navy shadow-lg transition-transform hover:scale-[1.03] ${className}`}
    >
      {label}
      <SiteIcon name="arrow" className="h-5 w-5" stroke={2.2} />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The attraction on the home page: a bold blue band with the studio's features and a picture or drawn graph. */
export function GraphingFeature({ t }: { t: SiteText }) {
  const url = t.text("graphing.url");
  const features = t.lines("graphing.features.items").map(splitFeature);
  const picture = t.image("home.graphing.image");
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-4" aria-labelledby="graphing-h">
      <Reveal className="mesh relative overflow-hidden rounded-3xl text-cream shadow-2xl shadow-navy/25">
        <div className="blob -right-16 -top-16 h-64 w-64 bg-gold/30" aria-hidden="true" />
        <div className="relative grid items-center gap-10 p-8 md:grid-cols-[1.05fr_1fr] md:p-12">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-gold px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-navy">
              <SiteIcon name="spark" className="h-3.5 w-3.5" stroke={2.2} />
              {t.text("graphing.home.kicker")}
            </span>
            <h2 id="graphing-h" className="mt-4 text-3xl font-semibold md:text-4xl">{t.text("graphing.home.heading")}</h2>
            <p className="mt-4 max-w-xl leading-7 text-cream/90">{t.text("graphing.home.body")}</p>
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="What is inside">
              {features.map((f) => (
                <li key={f.title} className="rounded-full border border-cream/25 bg-white/10 px-3.5 py-1.5 text-sm font-medium">{f.title}</li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <OpenStudioButton url={url} label={t.text("graphing.button")} />
              <Link href="/graphing-studio" className="font-semibold text-gold underline decoration-gold/60 decoration-2 underline-offset-4 hover:decoration-gold">
                {t.text("graphing.home.more")}
              </Link>
            </div>
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="group block" aria-label={`${t.text("graphing.home.heading")} (opens in a new tab)`}>
            <div className="overflow-hidden rounded-2xl border border-white/20 bg-navy/60 shadow-2xl transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[0.4deg]">
              <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/5 px-4 py-2.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-gold/90" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-3 truncate rounded-md bg-white/10 px-3 py-0.5 text-xs text-cream/70">{url.replace(/^https:\/\//, "").replace(/\/$/, "")}</span>
              </div>
              <div className="aspect-[3/2]">
                {picture ? (
                  <SiteImage path={picture} alt={t.imageAlt("home.graphing.image")} rounded="rounded-none" />
                ) : (
                  <GraphArt className="h-full w-full p-3" />
                )}
              </div>
            </div>
          </a>
        </div>
      </Reveal>
    </section>
  );
}
