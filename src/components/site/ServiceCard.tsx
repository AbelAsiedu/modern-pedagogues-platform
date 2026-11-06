import { SiteIcon, type SiteIconName } from "./Brand";
import { Reveal } from "./Reveal";

/**
 * One service card, shared by the Home and Services pages. With an uploaded picture the card shows it at the top;
 * without one it shows the icon badge, so the card never looks empty.
 */
export function ServiceCard({
  n,
  icon,
  title,
  body,
  image,
  imageAlt,
  heading: H = "h3",
}: {
  n: number;
  icon: SiteIconName;
  title: string;
  body: string;
  image?: string;
  imageAlt?: string;
  heading?: "h2" | "h3";
}) {
  return (
    <Reveal as="article" delay={(n % 3) * 90} className="lift group overflow-hidden rounded-3xl border border-navy/10 bg-white shadow-sm">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={imageAlt ?? ""} loading="lazy" className="aspect-[8/5] w-full object-cover" />
      ) : null}
      <div className="p-7">
        {image ? null : (
          <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-cream-deep text-royal transition-colors group-hover:bg-royal group-hover:text-gold">
            <SiteIcon name={icon} className="h-7 w-7" />
          </span>
        )}
        <p className="text-xs font-bold tracking-widest text-gold-ink">0{n}</p>
        <H className="mt-1 font-sans text-lg font-semibold">{title}</H>
        <p className="mt-2 text-sm leading-6 text-navy/75">{body}</p>
      </div>
    </Reveal>
  );
}
