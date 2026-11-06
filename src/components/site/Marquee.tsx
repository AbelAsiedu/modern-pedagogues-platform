/**
 * A seamless, endlessly looping ticker. The content is rendered twice and the track slides by exactly half its
 * width, so the loop has no jump. The second copy is hidden from screen readers and from keyboard focus.
 * It pauses under the mouse and while something inside has focus. With reduced motion it becomes a plain scrollable row.
 */
export function Marquee({
  children,
  seconds = 40,
  label,
  className = "",
}: {
  children: React.ReactNode;
  seconds?: number;
  label: string;
  className?: string;
}) {
  return (
    <div className={`marquee ${className}`} role="region" aria-label={label}>
      <div className="marquee-track" style={{ "--dur": `${seconds}s` } as React.CSSProperties}>
        <div className="flex shrink-0 items-stretch gap-5 pr-5">{children}</div>
        <div className="flex shrink-0 items-stretch gap-5 pr-5" aria-hidden="true" data-dup inert>
          {children}
        </div>
      </div>
    </div>
  );
}
