import { SiteIcon, type SiteIconName } from "./Brand";

/**
 * A picture the administrator has uploaded, or, until they do, a tidy built-in illustration (blue gradient,
 * soft shapes and an icon) so the layout never looks empty or broken.
 */
export function SiteImage({
  path,
  alt = "",
  icon = "cap",
  className = "",
  rounded = "rounded-3xl",
  priority = false,
}: {
  path?: string;
  alt?: string;
  icon?: SiteIconName;
  className?: string;
  rounded?: string;
  priority?: boolean;
}) {
  if (path) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={path} alt={alt} loading={priority ? "eager" : "lazy"} className={`h-full w-full object-cover ${rounded} ${className}`} />;
  }
  return (
    <div aria-hidden="true" className={`relative isolate h-full w-full overflow-hidden ${rounded} bg-gradient-to-br from-royal via-royal-deep to-navy ${className}`}>
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gold/30 blur-2xl" />
      <div className="absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-sky-400/30 blur-3xl" />
      <div className="grid-fade absolute inset-0" />
      <div className="absolute inset-0 grid place-items-center">
        <span className="grid h-28 w-28 place-items-center rounded-full bg-cream/10 text-gold ring-1 ring-cream/25 backdrop-blur md:h-36 md:w-36">
          <SiteIcon name={icon} className="h-14 w-14 md:h-[4.5rem] md:w-[4.5rem]" stroke={1.3} />
        </span>
      </div>
    </div>
  );
}
