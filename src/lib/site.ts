import { money, type Money } from "./money";

/** Public business facts. Single source for the website; change here, not in page copy. */
export const SITE = {
  name: "The Modern Pedagogues",
  shortName: "TMP",
  tagline: "Education keeps changing. So do we.",
  motto: "Empowering Lives, Changing Destinies.",
  founded: 2019,
  email: "themodernpedagogues@gmail.com",
  // Taken from the legacy site's public contact page; owner to confirm it is still current.
  phoneDisplay: "+233 59 366 0708",
  phoneTel: "+233593660708",
  whatsappNumber: "233593660708",
  country: "Ghana",
} as const;

export const whatsappLink = (message: string) =>
  `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(message)}`;

/** Owner decision (2026-11-04): negotiable per learner, from GHS 100 per session. */
export const INDICATIVE_TUTORING_RATE: Money = money(10_000n, "GHS");

export const CURRICULA_NAMES = ["Ghana Education Service", "Cambridge / British", "Pearson Edexcel", "IB", "Canadian"] as const;

export const SERVICES = [
  {
    title: "Home tuition",
    body: "One-on-one teaching for Pre-school, Primary, JHS and SHS learners, built around each ward's pace, subjects and schedule.",
  },
  {
    title: "Online and international support",
    body: "Structured remote lessons for students on British, Pearson Edexcel, IB, Canadian and other curricula, wherever they are based.",
  },
  {
    title: "Final Lap exam preparation",
    body: "Intensive revision and mock examinations ahead of BECE and other major assessments, with progress tracked mock by mock.",
  },
  {
    title: "Pre-SHS Launchpad",
    body: "Structured preparation for students moving into Senior High School.",
  },
  {
    title: "Curriculum and assessment consulting",
    body: "Curriculum design and assessment services for schools and institutions.",
  },
  {
    title: "Tutor training and management",
    body: "Recruitment, training and ongoing management of a qualified tutor network.",
  },
] as const;
