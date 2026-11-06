import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/site/TutorCard";
import { whatsappLink } from "@/lib/site";
import { db } from "@/server/db";
import { getPublicTutor } from "@/server/tutors/service";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  try {
    return await getPublicTutor(db(), id);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await load((await params).id);
  return t ? { title: t.displayName, description: t.headline } : { title: "Tutor not found" };
}

export default async function TutorPage({ params }: Props) {
  const t = await load((await params).id);
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/tutors" className="text-sm underline">← All tutors</Link>
      <div className="mt-6 flex items-center gap-5">
        <Avatar name={t.displayName} photoPath={t.photoPath} size="h-20 w-20 text-2xl" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t.displayName}</h1>
          <p className="mt-1 text-navy/70">{t.headline}</p>
        </div>
      </div>
      <p className="mt-8 whitespace-pre-line leading-7">{t.bio}</p>
      <dl className="mt-8 grid gap-6 sm:grid-cols-2">
        <div><dt className="text-sm font-semibold uppercase tracking-widest text-gold">Subjects</dt><dd className="mt-1">{t.subjects.join(", ")}</dd></div>
        <div><dt className="text-sm font-semibold uppercase tracking-widest text-gold">Levels</dt><dd className="mt-1">{t.levels.join(", ")}</dd></div>
        {t.curricula.length ? <div><dt className="text-sm font-semibold uppercase tracking-widest text-gold">Curricula</dt><dd className="mt-1">{t.curricula.join(", ")}</dd></div> : null}
        <div><dt className="text-sm font-semibold uppercase tracking-widest text-gold">Lessons</dt><dd className="mt-1">{t.modes.join(" or ")}{t.areas ? ` · ${t.areas}` : ""}</dd></div>
        {t.yearsExperience != null ? <div><dt className="text-sm font-semibold uppercase tracking-widest text-gold">Experience</dt><dd className="mt-1">{t.yearsExperience} {t.yearsExperience === 1 ? "year" : "years"}</dd></div> : null}
      </dl>
      <p className="mt-10 text-sm text-navy/70">Rates are agreed with TMP per learner. Contact details are not shared; we arrange every introduction.</p>
      <a href={whatsappLink(`Hello TMP, I would like to ask about ${t.displayName} as a tutor for my ward.`)} className="mt-4 inline-block rounded-full bg-navy px-6 py-3 font-semibold text-cream">
        Ask TMP about this tutor
      </a>
    </div>
  );
}
