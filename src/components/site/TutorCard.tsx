import Link from "next/link";
import { whatsappLink } from "@/lib/site";
import type { PublicTutor } from "@/server/tutors/service";

/** Initials in a circle: tutor photos arrive with the storage module and need the tutor's consent. */
export function Initials({ name, size = "h-14 w-14 text-lg" }: { name: string; size?: string }) {
  const initials = name.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-navy font-semibold text-gold ${size}`}>
      {initials || "T"}
    </span>
  );
}

export function TutorCard({ tutor }: { tutor: PublicTutor }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-navy/10 bg-white/70 p-6">
      <div className="flex items-center gap-4">
        <Initials name={tutor.displayName} />
        <div>
          <h2 className="text-lg font-semibold leading-tight">
            <Link href={`/tutors/${tutor.id}`} className="hover:text-gold">{tutor.displayName}</Link>
          </h2>
          <p className="text-sm text-navy/70">{tutor.headline}</p>
        </div>
      </div>
      <p className="mt-4 line-clamp-4 text-sm leading-6">{tutor.bio}</p>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Subjects">
        {tutor.subjects.slice(0, 6).map((s) => <li key={s} className="rounded-full bg-cream-deep px-3 py-1">{s}</li>)}
      </ul>
      <p className="mt-3 text-xs text-navy/70">
        {[tutor.levels.join(", "), tutor.modes.join(" or ")].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-auto flex flex-wrap gap-3 pt-5 text-sm font-semibold">
        <Link href={`/tutors/${tutor.id}`} className="underline decoration-gold underline-offset-4">View profile</Link>
        <a href={whatsappLink(`Hello TMP, I would like to ask about ${tutor.displayName} as a tutor for my ward.`)} className="underline decoration-gold underline-offset-4">
          Ask about this tutor
        </a>
      </div>
    </article>
  );
}
