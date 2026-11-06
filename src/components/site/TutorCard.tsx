import Link from "next/link";
import type { PublicTutor } from "@/server/tutors/service";

/** The tutor's photo when staff have added one (with the tutor's consent), otherwise their initials in a circle. */
export function Avatar({ name, photoPath, size = "h-14 w-14 text-lg" }: { name: string; photoPath: string | null; size?: string }) {
  if (!photoPath) return <Initials name={name} size={size} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={photoPath} alt="" className={`shrink-0 rounded-full object-cover ${size.split(" ").filter((c) => c.startsWith("h-") || c.startsWith("w-")).join(" ")}`} />;
}

export function Initials({ name, size = "h-14 w-14 text-lg" }: { name: string; size?: string }) {
  const initials = name.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-navy font-semibold text-gold ${size}`}>
      {initials || "T"}
    </span>
  );
}

export function TutorCard({
  tutor,
  whatsapp,
  heading: Heading = "h2",
}: {
  tutor: PublicTutor;
  whatsapp: (message: string) => string;
  heading?: "h2" | "h3";
}) {
  const initials = tutor.displayName.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <article className="lift group flex h-full flex-col overflow-hidden rounded-3xl border border-navy/10 bg-white shadow-sm">
      <Link href={`/tutors/${tutor.id}`} aria-label={`View ${tutor.displayName}'s profile`} className="relative block aspect-[5/4] overflow-hidden bg-gradient-to-br from-royal to-navy">
        {tutor.photoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tutor.photoPath} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <span aria-hidden="true" className="grid h-full w-full place-items-center text-6xl font-semibold text-gold/90">{initials || "T"}</span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <Heading className="font-sans text-lg font-semibold leading-tight">
          <Link href={`/tutors/${tutor.id}`} className="hover:text-royal">{tutor.displayName}</Link>
        </Heading>
        <p className="mt-1 text-sm font-medium text-royal">{tutor.subjects.slice(0, 3).join(" · ")}</p>
        <p className="mt-2 line-clamp-2 text-sm text-navy/70">{tutor.headline}</p>
        <p className="mt-2 text-xs text-navy/60">{[tutor.levels.join(", "), tutor.modes.join(" or ")].filter(Boolean).join(" · ")}</p>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-sm font-semibold">
          <Link href={`/tutors/${tutor.id}`} className="text-royal underline decoration-gold decoration-2 underline-offset-4">View profile</Link>
          <a href={whatsapp(`Hello TMP, I would like to ask about ${tutor.displayName} as a tutor for my ward.`)} className="underline decoration-gold decoration-2 underline-offset-4">
            Ask about this tutor
          </a>
        </div>
      </div>
    </article>
  );
}
