import type { Metadata } from "next";
import { Hero } from "@/components/site/Chrome";
import { CURRICULA_NAMES, SERVICES, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Services",
  description: "Home tuition, online and international support, Final Lap exam preparation, Pre-SHS Launchpad, and curriculum consulting.",
};

export default function Services() {
  return (
    <>
      <Hero kicker="Services" title="Support that moves with every learner">
        <p>Tutoring and consulting for families, schools and institutions in Ghana and abroad.</p>
      </Hero>
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-2">
          {SERVICES.map((s, i) => (
            <article key={s.title} className="border-t-2 border-gold pt-4">
              <p className="text-sm font-semibold text-gold">0{i + 1}</p>
              <h2 className="mt-1 text-xl font-semibold">{s.title}</h2>
              <p className="mt-2">{s.body}</p>
            </article>
          ))}
        </div>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold">Curricula we support</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CURRICULA_NAMES.map((c) => (
              <li key={c} className="rounded-full bg-cream-deep px-4 py-2 text-sm">{c}</li>
            ))}
          </ul>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold">Our tutors</h2>
          <p className="mt-3 max-w-3xl">
            Every TMP tutor is assessed, onboarded and monitored before being placed with a ward, and works as part of one
            coordinated team to one standard. Parents always have a direct contact at TMP.
          </p>
          <a
            href={whatsappLink("Hello TMP, I would like help choosing a programme for my ward.")}
            className="mt-6 inline-block rounded-full bg-navy px-6 py-3 font-semibold text-cream"
          >
            Get help choosing
          </a>
        </section>

        <section className="mt-16 rounded-2xl bg-cream-deep p-8">
          <h2 className="text-xl font-semibold">Coming soon</h2>
          <p className="mt-2 max-w-3xl">
            Online learning courses, a marketplace of teacher-made resources, and parent and student portals are being
            built. They are not available yet.
          </p>
        </section>
      </div>
    </>
  );
}
