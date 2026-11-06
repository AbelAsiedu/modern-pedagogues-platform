import { seoMetadata } from "@/server/seo";
import { Hero } from "@/components/site/Chrome";
import { RichText } from "@/components/site/RichText";
import { getSiteText } from "@/server/context";

export const generateMetadata = () => seoMetadata("about");

export default async function About() {
  const t = await getSiteText();
  return (
    <>
      <Hero kicker="About TMP" title={t.text("about.hero.title")}>
        <p>{t.text("about.hero.intro")}</p>
      </Hero>
      <div className="mx-auto max-w-3xl px-6 py-16 leading-7">
        <h2 className="text-2xl font-semibold">{t.text("about.story.heading")}</h2>
        <div className="[&_p]:mt-4">
          <RichText text={t.text("about.story.body")} />
        </div>
        <h2 className="mt-12 text-2xl font-semibold">{t.text("about.principles.heading")}</h2>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="border-t-2 border-gold pt-3">
              <h3 className="font-semibold">{t.text(`about.principle${n}.title`)}</h3>
              <p className="mt-2 text-sm">{t.text(`about.principle${n}.body`)}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 italic">{t.text("about.motto")}</p>
      </div>
    </>
  );
}
