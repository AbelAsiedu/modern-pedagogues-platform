import Link from "next/link";
import { seoMetadata } from "@/server/seo";
import { Hero } from "@/components/site/Chrome";
import { Reveal } from "@/components/site/Reveal";
import { TutorCard } from "@/components/site/TutorCard";
import { getSiteText } from "@/server/context";
import { db } from "@/server/db";
import { listPublicTutors, tutorFilterOptions, TEACHING_MODES, MODE_LABELS, type PublicTutor } from "@/server/tutors/service";

export const generateMetadata = () => seoMetadata("tutors");

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Tutors({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const filter = { level: one(sp.level), curriculum: one(sp.curriculum), subject: one(sp.subject).slice(0, 40), mode: one(sp.mode) };
  const t = await getSiteText();
  let tutors: PublicTutor[] = [];
  let options: Awaited<ReturnType<typeof tutorFilterOptions>> = { levels: [], curricula: [] };
  let unavailable = false;
  try {
    [tutors, options] = await Promise.all([listPublicTutors(db(), filter), tutorFilterOptions(db())]);
  } catch {
    unavailable = true;
  }
  const filtered = Object.values(filter).some(Boolean);
  const sel = "mt-1 w-full rounded-xl border border-navy/25 bg-white px-3 py-2 text-sm";
  return (
    <>
      <Hero kicker="Tutors" title={t.text("tutors.hero.title")} imageKey="page.tutors.image" icon="users">
        <p>{t.text("tutors.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <form method="get" className="grid gap-4 rounded-3xl border border-navy/10 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5" aria-label="Filter tutors">
          <label className="text-sm font-medium">
            Level
            <select name="level" defaultValue={filter.level} className={sel}>
              <option value="">Any level</option>
              {options.levels.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Curriculum
            <select name="curriculum" defaultValue={filter.curriculum} className={sel}>
              <option value="">Any curriculum</option>
              {options.curricula.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Subject
            <input name="subject" defaultValue={filter.subject} placeholder="e.g. Mathematics" maxLength={40} className={sel} />
          </label>
          <label className="text-sm font-medium">
            Where
            <select name="mode" defaultValue={filter.mode} className={sel}>
              <option value="">Home or online</option>
              {TEACHING_MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-cream">Search</button>
            {filtered ? <Link href="/tutors" className="text-sm underline">Clear</Link> : null}
          </div>
        </form>

        {unavailable ? (
          <p className="mt-10" role="status">The tutor list is unavailable right now. Please try again shortly or contact us.</p>
        ) : tutors.length === 0 ? (
          <p className="mt-10 max-w-2xl" role="status">{t.text("tutors.empty")}</p>
        ) : (
          <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Tutors">
            {tutors.map((x, i) => <Reveal as="li" key={x.id} delay={(i % 3) * 90}><TutorCard tutor={x} whatsapp={t.whatsapp} /></Reveal>)}
          </ul>
        )}

        <p className="mt-14 text-sm">
          Are you a tutor? <Link href="/tutors/apply" className="font-semibold underline decoration-gold underline-offset-4">Apply to join TMP</Link>.
        </p>
      </div>
    </>
  );
}
