import { CURRICULA_NAMES, SERVICES, SITE } from "@/lib/site";

/**
 * Every piece of site text an administrator can edit. The `default` is what visitors see until an editor
 * changes it, and what they see again if an edit is reset. Defaults live in code so the site is complete
 * on a brand-new database and never shows a blank page.
 *
 * Text may use {tokens} (see TEMPLATE_VARS in lib/site-content) and, where kind is "rich", the small markup
 * described in lib/richtext.ts.
 */

export type ContentKind = "line" | "text" | "lines" | "rich" | "image";
export type ContentGroupId = "business" | "navigation" | "seo" | "images" | "home" | "services" | "tutors" | "assistant" | "shop" | "about" | "pricing" | "graphing" | "contact" | "footer" | "policies";

export type ContentEntry = {
  key: string;
  group: ContentGroupId;
  label: string;
  kind: ContentKind;
  max: number;
  default: string;
  help?: string;
  /** Policies and business details need the legal permission; everything else needs the site permission. */
  permission: "content.manage_site" | "content.manage_legal";
  /** May be left empty (an empty default). */
  optional?: boolean;
  /** Returns a plain-words problem, or null when the value is acceptable. Checked on save. */
  validate?: (value: string) => string | null;
};

export const CONTENT_GROUPS: readonly { id: ContentGroupId; label: string; blurb: string }[] = [
  { id: "business", label: "Business details", blurb: "Name, motto, email and the phone, WhatsApp and Mobile Money numbers shown everywhere on the site and in emails. The MoMo number is where buyers send money, so only people who can edit legal text may change these." },
  { id: "navigation", label: "Menu and buttons", blurb: "The words in the top menu, the sign-in link, the main button and the footer headings." },
  { id: "seo", label: "Page titles and search descriptions", blurb: "What shows in the browser tab and in Google results for each main page. Keep titles under about 60 characters and descriptions under about 160." },
  { id: "images", label: "Site images", blurb: "Pictures used around the site. Managed on the Site images page, not here." },
  { id: "home", label: "Home page", blurb: "Text around the slideshow, the figures strip, the curricula strip, how it works, testimonials and the closing banner. Edit the slides themselves under Home slideshow." },
  { id: "services", label: "Services page", blurb: "The service descriptions here also appear on the home page." },
  { id: "tutors", label: "Tutors pages", blurb: "Wording around the tutor directory and the tutor application. Tutor profiles themselves are edited under Tutors." },
  { id: "assistant", label: "Kaitlyn (chat assistant)", blurb: "The words around the chat window. What Kaitlyn knows is edited under Kaitlyn in the admin menu." },
  { id: "shop", label: "Resources", blurb: "Wording on the Resources pages (browse, quality standards, becoming a creator) and the payment steps shown to buyers. The resources themselves are edited under Resources in the admin menu." },
  { id: "about", label: "About page", blurb: "Who we are and what we stand for." },
  { id: "pricing", label: "Pricing page", blurb: "The rate itself comes from site settings, not from this text." },
  { id: "graphing", label: "Graphing Studio", blurb: "The Graphing Studio link and the wording on the home page feature and the Graphing Studio page. Pictures are set under Site images." },
  { id: "contact", label: "Contact page", blurb: "The Contact page wording. The email, phone and Mobile Money numbers it shows are set under Business details." },
  { id: "footer", label: "Footer", blurb: "The line shown at the bottom of every page." },
  { id: "policies", label: "Terms, privacy and refunds", blurb: "Legal text. Have it reviewed by a lawyer before relying on it." },
];

const SITE_PERM = "content.manage_site" as const;
const LEGAL_PERM = "content.manage_legal" as const;

function e(
  key: string,
  group: ContentGroupId,
  label: string,
  kind: ContentKind,
  max: number,
  def: string,
  extra: { help?: string; permission?: ContentEntry["permission"]; optional?: boolean; validate?: ContentEntry["validate"] } = {},
): ContentEntry {
  return { key, group, label, kind, max, default: def, help: extra.help, permission: extra.permission ?? SITE_PERM, optional: extra.optional, validate: extra.validate };
}

const SERVICE_ENTRIES = SERVICES.flatMap((s, i) => [
  e(`services.${i + 1}.title`, "services", `Service ${i + 1}: name`, "line", 80, s.title),
  e(`services.${i + 1}.body`, "services", `Service ${i + 1}: description`, "text", 400, s.body),
]);

const httpsUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname.includes(".") ? null : "Enter a full link starting with https://";
  } catch {
    return "Enter a full link starting with https://";
  }
};

export const CONTENT_ENTRIES: readonly ContentEntry[] = [
  // Business details (also feed the {name} {email} {phone} {momo} {momo_number} {motto} tokens)
  e("site.name", "business", "Business name", "line", 80, SITE.name, { permission: LEGAL_PERM }),
  e("site.motto", "business", "Motto", "line", 120, SITE.motto, { permission: LEGAL_PERM }),
  e("site.email", "business", "Public email", "line", 120, SITE.email, {
    permission: LEGAL_PERM,
    help: "Shown on the Contact page and in the footer, and used for order and application alerts.",
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Enter a valid email address."),
  }),
  e("site.phone", "business", "Phone and WhatsApp number", "line", 30, SITE.phoneDisplay, {
    permission: LEGAL_PERM,
    help: "Include the country code, for example +233 59 366 0708. The Call and WhatsApp links are made from it.",
    validate: (v) => (/^\+?[0-9 ()-]{7,20}$/.test(v) && v.replace(/\D/g, "").length >= 9 ? null : "Enter a valid phone number with its country code."),
  }),
  e("site.momo_network", "business", "Mobile Money network", "line", 40, SITE.momoNetwork, { permission: LEGAL_PERM }),
  e("site.momo_number", "business", "Mobile Money number", "line", 30, SITE.phoneDisplay, {
    permission: LEGAL_PERM,
    help: "The number buyers send payments to. Changing it changes the payment steps buyers see straight away.",
    validate: (v) => (/^\+?[0-9 ()-]{7,20}$/.test(v) && v.replace(/\D/g, "").length >= 9 ? null : "Enter a valid Mobile Money number."),
  }),

  e("site.facebook", "business", "Facebook page link", "line", 200, "", { optional: true, help: "Optional. A full https:// link. Leave empty to hide the icon.", validate: httpsUrl }),
  e("site.instagram", "business", "Instagram link", "line", 200, "", { optional: true, help: "Optional. Leave empty to hide the icon.", validate: httpsUrl }),
  e("site.x", "business", "X (Twitter) link", "line", 200, "", { optional: true, help: "Optional. Leave empty to hide the icon.", validate: httpsUrl }),
  e("site.youtube", "business", "YouTube link", "line", 200, "", { optional: true, help: "Optional. Leave empty to hide the icon.", validate: httpsUrl }),
  e("site.linkedin", "business", "LinkedIn link", "line", 200, "", { optional: true, help: "Optional. Leave empty to hide the icon.", validate: httpsUrl }),
  e("site.tiktok", "business", "TikTok link", "line", 200, "", { optional: true, help: "Optional. Leave empty to hide the icon.", validate: httpsUrl }),

  // Site images (edited on the Site images page; empty means the built-in illustration is shown)
  e("site.logo", "images", "Logo", "image", 200, "", { optional: true, help: "Replaces the built-in TMP logo (the tmp lettering and name) in the header and footer. Use a transparent PNG or WebP that looks good on dark blue, about 400 × 120." }),
  e("home.about.image", "images", "Home: Building a Brighter Future picture", "image", 200, "", { optional: true, help: "Learners or a classroom. Landscape, about 1200 × 900." }),
  e("home.impact.image", "images", "Home: Our Impact picture", "image", 200, "", { optional: true, help: "A campus, school or group photo. Landscape, about 1200 × 800." }),
  e("home.testimonials.image", "images", "Home: testimonials picture", "image", 200, "", { optional: true, help: "Shown beside the quotes, for example graduates or a class. Landscape, about 1000 × 800." }),
  e("home.cta.image", "images", "Home: closing banner picture", "image", 200, "", { optional: true, help: "A smiling learner works well. Portrait or square, about 900 × 900." }),
  e("page.services.image", "images", "Services page: banner picture", "image", 200, "", { optional: true, help: "Fills the whole top banner behind a light blue layer, so use a wide landscape picture, about 1600 × 700, with the subject away from the left side where the text sits." }),
  e("page.tutors.image", "images", "Tutors page: banner picture", "image", 200, "", { optional: true, help: "Fills the whole top banner behind a light blue layer. Wide landscape, about 1600 × 700." }),
  e("page.resources.image", "images", "Resources page: banner picture", "image", 200, "", { optional: true, help: "Fills the whole top banner behind a light blue layer. Wide landscape, about 1600 × 700." }),
  e("page.pricing.image", "images", "Pricing page: banner picture", "image", 200, "", { optional: true, help: "Fills the whole top banner behind a light blue layer. Wide landscape, about 1600 × 700." }),
  e("page.graphing.image", "images", "Graphing Studio page: banner picture", "image", 200, "", { optional: true, help: "Fills the whole top banner behind a light blue layer. Wide landscape, about 1600 × 700." }),
  e("home.graphing.image", "images", "Home page: Graphing Studio picture", "image", 200, "", { optional: true, help: "A screenshot of the Graphing Studio shown on the home page feature. Landscape, about 1200 × 800. Without one, a drawn graph is shown." }),
  e("page.about.image", "images", "About page: banner picture", "image", 200, "", { optional: true, help: "Fills the whole top banner behind a light blue layer. Wide landscape, about 1600 × 700." }),
  e("page.contact.image", "images", "Contact page: banner picture", "image", 200, "", { optional: true, help: "Fills the whole top banner behind a light blue layer. Wide landscape, about 1600 × 700." }),
  e("site.favicon", "images", "Browser tab icon", "image", 200, "", { optional: true, help: "The small icon in the browser tab. A square PNG, about 256 × 256, with a simple shape." }),
  e("site.share_image", "images", "Picture shown when the site is shared", "image", 200, "", { optional: true, help: "Shown when a link to the site is shared on WhatsApp, Facebook and similar. Landscape, 1200 × 630, with the text and logo near the middle." }),
  e("assistant.avatar", "images", "Kaitlyn's picture", "image", 200, "", { optional: true, help: "Shown in the chat window and on the chat button. A square picture of a face or a mascot, about 300 × 300." }),
  e("about.story.image", "images", "About page: story picture", "image", 200, "", { optional: true, help: "Shown beside \"Built around the student\". Landscape, about 1200 × 900." }),
  ...[1, 2, 3, 4, 5, 6].map((n) =>
    e(`service.${n}.image`, "images", `Service ${n}: card picture`, "image", 200, "", { optional: true, help: "Shown at the top of this service's card (Home and Services pages) instead of its icon. Landscape, about 800 × 500. The card text is under Site text > Services." }),
  ),

  // Menu and buttons
  e("nav.home", "navigation", "Menu: Home", "line", 24, "Home"),
  e("nav.services", "navigation", "Menu: Services", "line", 24, "Services"),
  e("nav.tutors", "navigation", "Menu: Tutors", "line", 24, "Tutors"),
  e("nav.resources", "navigation", "Menu: Resources", "line", 24, "Resources"),
  e("nav.pricing", "navigation", "Menu: Pricing", "line", 24, "Pricing"),
  e("nav.about", "navigation", "Menu: About", "line", 24, "About"),
  e("nav.graphing", "navigation", "Menu: Graphing Studio", "line", 24, "Graphing Studio"),
  e("nav.contact", "navigation", "Menu: Contact", "line", 24, "Contact"),
  e("nav.account", "navigation", "Menu: My account (signed in)", "line", 24, "My account"),
  e("nav.signin", "navigation", "Menu: Sign in (signed out)", "line", 24, "Sign in"),
  e("nav.cta", "navigation", "Main button", "line", 30, "Request a tutor"),
  e("footer.tagline", "navigation", "Footer: tagline", "line", 60, "Educate · Empower · Transform"),
  e("footer.contact_heading", "navigation", "Footer: contact heading", "line", 30, "Contact"),
  e("footer.policies_heading", "navigation", "Footer: policies heading", "line", 30, "Policies"),

  // Page titles and search descriptions
  e("seo.home.title", "seo", "Home: title", "line", 70, "The Modern Pedagogues: tutoring and learning resources in Ghana"),
  e("seo.home.description", "seo", "Home: description", "text", 170, "Personalised tutoring, exam preparation and quality learning resources for Ghanaian and international learners."),
  e("seo.services.title", "seo", "Services: title", "line", 70, "Services"),
  e("seo.services.description", "seo", "Services: description", "text", 170, "Home tuition, online and international support, Final Lap exam preparation, Pre-SHS Launchpad, and curriculum consulting."),
  e("seo.tutors.title", "seo", "Tutors: title", "line", 70, "Our tutors"),
  e("seo.tutors.description", "seo", "Tutors: description", "text", 170, "Meet tutors reviewed and approved by The Modern Pedagogues, for home and online lessons across Ghana."),
  e("seo.resources.title", "seo", "Resources: title", "line", 70, "Resources"),
  e("seo.resources.description", "seo", "Resources: description", "text", 170, "Books, courses, worksheets and past questions for Ghanaian learners. Free downloads and paid resources, each reviewed against a published quality standard."),
  e("seo.pricing.title", "seo", "Pricing: title", "line", 70, "Pricing"),
  e("seo.pricing.description", "seo", "Pricing: description", "text", 170, "Tutoring fees at The Modern Pedagogues depend on curriculum, mode, hours and location, and are agreed after your child's assessment. From {rate} per session."),
  e("seo.graphing.title", "seo", "Graphing Studio: title", "line", 70, "Graphing Studio"),
  e("seo.graphing.description", "seo", "Graphing Studio: description", "text", 170, "TMP Graphing Studio: an interactive maths tool for drawing, graph paper, equation plotting, statistical charts and geometric constructions."),
  e("seo.about.title", "seo", "About: title", "line", 70, "About"),
  e("seo.about.description", "seo", "About: description", "text", 170, "Who we are and what we stand for at The Modern Pedagogues."),
  e("seo.contact.title", "seo", "Contact: title", "line", 70, "Contact"),
  e("seo.contact.description", "seo", "Contact: description", "text", 170, "Talk to The Modern Pedagogues by phone, WhatsApp or email."),

  // Home (new design)
  e("home.slideshow.seconds", "home", "Slideshow: seconds per slide", "line", 3, "6", {
    help: "Whole seconds, from 3 to 20. The slideshow loops on its own; visitors can pause it.",
    validate: (v) => (/^\d{1,2}$/.test(v) && Number(v) >= 3 && Number(v) <= 20 ? null : "Enter a whole number of seconds from 3 to 20."),
  }),
  e("home.curricula", "home", "Curricula strip (one per line)", "lines", 400, CURRICULA_NAMES.join("\n"), { help: "Scrolls across the home page and is listed on the Services page." }),
  e("home.hero.kicker", "home", "Slideshow: small line above the headline", "line", 50, "Learn · Grow · Succeed"),
  e("home.hero.search", "home", "Slideshow: search box hint", "line", 60, "Search resources…"),
  e("home.services.sub", "home", "Services section: small text", "line", 140, "Comprehensive educational solutions for every learner."),
  e("home.about.heading", "home", "Split section: heading", "line", 80, "Building a Brighter Future"),
  e("home.about.body", "home", "Split section: text", "text", 400, "Since {founded}, {name} has supported learners across Ghana and beyond with qualified tutors, plans built around each learner, and honest progress reporting. We believe in the power of education to transform lives and communities."),
  e("home.about.button", "home", "Split section: button", "line", 30, "Learn more"),
  e("home.impact.heading", "home", "Our Impact: heading", "line", 60, "Our Impact"),
  e("home.impact.sub", "home", "Our Impact: small text", "line", 140, "Through education, we create opportunities."),
  e("home.tutors.heading", "home", "Meet our tutors: heading", "line", 60, "Meet Our Tutors"),
  e("home.tutors.sub", "home", "Meet our tutors: small text", "line", 140, "Learn from qualified and passionate educators."),
  e("home.tutors.button", "home", "Meet our tutors: button", "line", 30, "See all tutors"),
  e("home.stat1.value", "home", "Figure 1: value", "line", 20, "Since 2019"),
  e("home.stat1.label", "home", "Figure 1: label", "line", 50, "Teaching in Ghana"),
  e("home.stat2.value", "home", "Figure 2: value", "line", 20, "5"),
  e("home.stat2.label", "home", "Figure 2: label", "line", 50, "Curricula supported"),
  e("home.stat3.value", "home", "Figure 3: value", "line", 20, "Pre-school to SHS"),
  e("home.stat3.label", "home", "Figure 3: label", "line", 50, "Every stage covered"),
  e("home.stat4.value", "home", "Figure 4: value", "line", 20, "Home + online"),
  e("home.stat4.label", "home", "Figure 4: label", "line", 50, "Lessons where you are"),
  e("home.how.heading", "home", "How it works: heading", "line", 80, "How it works"),
  e("home.how1.title", "home", "Step 1: title", "line", 50, "Tell us what you need"),
  e("home.how1.body", "home", "Step 1: text", "text", 200, "Message us on WhatsApp or call. Tell us the level, the subjects and what your ward is aiming for."),
  e("home.how2.title", "home", "Step 2: title", "line", 50, "We match a tutor"),
  e("home.how2.body", "home", "Step 2: text", "text", 200, "We recommend a reviewed, approved tutor and agree the rate with you before the first lesson."),
  e("home.how3.title", "home", "Step 3: title", "line", 50, "Learn and track progress"),
  e("home.how3.body", "home", "Step 3: text", "text", 200, "Lessons start, and you get honest progress reports with a direct line to TMP."),
  e("home.resources.heading", "home", "Resources strip: heading", "line", 80, "Fresh from the library"),
  e("home.resources.body", "home", "Resources strip: text", "text", 200, "Free and paid books, courses and worksheets, each checked against our quality standard."),
  e("home.testimonials.heading", "home", "Testimonials: heading", "line", 80, "What Our Learners Say"),
  e("home.testimonials.sub", "home", "Testimonials: small text", "line", 120, "Trusted by students, parents and educators."),
  e("home.testimonials", "home", "Testimonials (one per line: quote | name, role)", "lines", 2000, "", {
    optional: true,
    help: "Leave empty to hide the section. Only add real quotes you have permission to use. Format: The lessons changed how she studies. | Ama, parent. They rotate automatically.",
  }),
  e("home.cta.heading", "home", "Closing banner: heading", "line", 100, "Ready to take the next step?"),
  e("home.cta.body", "home", "Closing banner: text", "text", 240, "Tell us what your ward needs and we will suggest the right programme and tutor."),
  e("home.cta.button", "home", "Closing banner: button", "line", 40, "Contact us"),

  // Home
  e("home.pillar1.title", "home", "Highlight 1: title", "line", 60, "Pre-school to SHS"),
  e("home.pillar1.body", "home", "Highlight 1: text", "text", 200, "Support at every stage of a learner's journey."),
  e("home.pillar2.title", "home", "Highlight 2: title", "line", 60, "Ghanaian and international"),
  e("home.pillar2.body", "home", "Highlight 2: text", "text", 200, "GES, Cambridge / British, Pearson Edexcel, IB and Canadian curricula."),
  e("home.pillar3.title", "home", "Highlight 3: title", "line", 60, "Tracked progress"),
  e("home.pillar3.body", "home", "Highlight 3: text", "text", 200, "Honest reporting every term, and a direct line to TMP, not just the tutor."),
  e("home.services.heading", "home", "Services section heading", "line", 80, "Our Services"),
  e("home.fees.heading", "home", "Fees section heading", "line", 80, "Fees that fit the learner"),
  e(
    "home.fees.body",
    "home",
    "Fees section text",
    "text",
    500,
    "Every learner is different, so fees are too. They depend on curriculum, in-person or online lessons, number of hours and location, and are agreed only after your child's assessment. Sessions start from {rate}.",
    { help: "Keep {rate}: it is replaced by the current starting rate from site settings." },
  ),
  e("home.talk.label", "home", "Contact box: small heading", "line", 40, "Talk to us"),
  e("home.talk.body", "home", "Contact box: text", "text", 300, "Tell us what your ward needs next and we will suggest the right programme and tutor."),

  // Services page
  e("services.hero.title", "services", "Page headline", "line", 100, "Support that moves with every learner"),
  e("services.hero.intro", "services", "Page introduction", "text", 300, "Tutoring and consulting for families, schools and institutions in Ghana and abroad."),
  ...SERVICE_ENTRIES,
  e("services.curricula.heading", "services", "Curricula heading", "line", 80, "Curricula we support"),
  e("services.tutors.heading", "services", "Tutors heading", "line", 80, "Our tutors"),
  e(
    "services.tutors.body",
    "services",
    "Tutors text",
    "text",
    500,
    "Every TMP tutor is assessed, onboarded and monitored before being placed with a ward, and works as part of one coordinated team to one standard. Parents always have a direct contact at TMP.",
  ),
  e("services.soon.heading", "services", "Coming-soon heading", "line", 80, "Coming soon"),
  e(
    "services.soon.body",
    "services",
    "Coming-soon text",
    "text",
    400,
    "Online learning courses and parent and student portals are being built. They are not available yet.",
    { help: "Update this as features go live so the page stays truthful." },
  ),

  // Tutors
  e("tutors.hero.title", "tutors", "Tutors page headline", "line", 100, "Meet our tutors"),
  e("tutors.hero.intro", "tutors", "Tutors page introduction", "text", 300, "Every tutor listed here has been reviewed and approved by TMP. Tell us what your ward needs and we will recommend the right match."),
  e("tutors.empty", "tutors", "Message when no tutors match", "text", 300, "No tutors are listed for that search yet. Tell us what you need and we will find the right tutor for you."),
  e("tutors.apply.heading", "tutors", "Application page headline", "line", 100, "Teach with The Modern Pedagogues"),
  e(
    "tutors.apply.intro",
    "tutors",
    "Application page introduction",
    "text",
    500,
    "We work with qualified, committed tutors across Pre-school, Primary, JHS and SHS. Tell us about yourself. Our team reviews every application, and nothing is shown on the website until you have been approved.",
  ),

  // Shop
  e("shop.hero.title", "shop", "Resources headline", "line", 100, "Learning resources"),
  e("shop.hero.intro", "shop", "Resources introduction", "text", 300, "Books, courses, worksheets and past questions from The Modern Pedagogues and from teachers across Ghana. Every resource is reviewed against our quality standard. Free ones download at once; paid ones unlock after Mobile Money payment."),
  e("shop.empty", "shop", "Message when there are no resources", "text", 300, "New resources are on the way. Ask us on WhatsApp if there is something you need."),
  e("shop.pay.heading", "shop", "Payment steps heading", "line", 80, "How to pay"),
  e(
    "shop.pay.steps",
    "shop",
    "Payment steps",
    "lines",
    600,
    "Send the amount shown by {momo} to {momo_number}.\nUse your order reference as the payment reference.\nWe confirm payments personally, usually within a few hours. Your download then appears under My orders.",
    { help: "One step per line. {momo} and {momo_number} are filled in automatically." },
  ),

  e(
    "resources.standards.intro",
    "shop",
    "Quality standard: introduction",
    "rich",
    2000,
    "Every resource sold or shared on this site is read by a TMP reviewer before it goes live. We hold teachers and publishers to the same bar we hold our own work to. The criteria below are exactly what reviewers score, so you can check your work against them before you submit.",
    { help: "Shown above the criteria on the Quality standard page. The criteria themselves are fixed in the system so that every review uses the same rubric." },
  ),
  e(
    "creator.join.intro",
    "shop",
    "Become a creator: introduction",
    "text",
    600,
    "Share your teaching with learners across Ghana. Upload a book, course, worksheet or past-question pack as a PDF. If it meets our quality standard, we list it for free download or for sale. You keep 70% of every sale and are paid by Mobile Money.",
    { help: "Keep the percentage in line with the marketplace commission setting (currently 30% to TMP)." },
  ),
  e(
    "legal.creator_terms",
    "policies",
    "Creator terms",
    "rich",
    12000,
    `Last updated 6 November 2026. **Draft for legal review.**

## Your work and your rights

- You may upload only work you wrote, or work you hold the written right to sell and share. This includes every image, diagram, font and extract inside it.
- You keep the copyright in your work. You give TMP a non-exclusive licence to display, store and deliver it to buyers on this website for as long as it is listed, and to keep copies that buyers have already downloaded.
- Do not upload past examination papers or textbooks that belong to someone else without written permission. Material from WAEC, GES, Cambridge, Pearson and other bodies is theirs.
- Do not include personal information about children or other people, or contact details and links that take buyers away from this website.

## Review

- Every resource is reviewed by TMP against the published quality standard before it appears. We may approve it, ask you for changes, or decline it, and we will tell you why.
- If you change an approved resource in a way that affects what a reviewer judged (for example the text, subject or cover), it is taken off the website until it is approved again. Changing only the price does not need a new review.
- We may suspend or remove a resource at any time if there is a rights complaint, a safety problem, or it no longer meets the standard.

## Prices, commission and payment

- You set the price of a paid resource (from GH₵ 5 to GH₵ 5,000), or you may offer it free.
- TMP keeps 30% of each paid sale as its commission, and you receive 70%. The percentage that applied on the day a sale was confirmed is the one used for that sale.
- Buyers pay TMP by Mobile Money. We confirm each payment by hand, so your earnings appear once we have confirmed it.
- We pay your earnings to the Mobile Money number on your profile once your balance reaches GH₵ 50, normally within 14 days of your request. Each payout is recorded with its transaction ID.
- If a sale is refunded, the refund comes out of your share for that sale.

## Your account

- You may stop selling at any time by hiding or deleting a resource. Buyers who already paid keep their download.
- We may suspend your creator account if you break these terms.

## Changes

We will update this page and its date if the terms change.`,
    { permission: LEGAL_PERM, help: "The payout minimum (GH₵ 50) and timing (14 days) are draft figures for the owner to confirm. Headings start with ##." },
  ),

  // Kaitlyn
  e(
    "assistant.greeting",
    "assistant",
    "Greeting",
    "text",
    300,
    "Hi, I'm Kaitlyn, TMP's AI assistant. I can help with tutors, lessons, fees, payments and finding your way around the website. What can I help you with?",
  ),
  e(
    "assistant.disclaimer",
    "assistant",
    "Notice under the chat box",
    "text",
    300,
    "Kaitlyn is an AI and can make mistakes. Don't share passwords, card numbers or Mobile Money PINs here. Chats are saved for 90 days to improve our service.",
  ),

  // About
  e("about.hero.title", "about", "Page headline", "line", 100, "Education should keep moving forward"),
  e("about.hero.intro", "about", "Page introduction", "text", 300, "{name} was founded in {founded} on the belief that education should not stay frozen in the past."),
  e("about.story.heading", "about", "Story heading", "line", 80, "Built around the student"),
  e(
    "about.story.body",
    "about",
    "Story text",
    "rich",
    2000,
    "Every ward learns differently, so we build around the student, not a fixed syllabus delivered the same way to everyone. That means qualified tutors, a plan tailored to how each ward learns, tracked progress, and honest reporting, every term.\n\nWe work across Pre-school, Primary, JHS and SHS, and across Ghanaian, British, Pearson Edexcel, IB and Canadian curricula.",
    { help: "Leave a blank line between paragraphs." },
  ),
  e("about.principles.heading", "about", "Principles heading", "line", 80, "Our principles"),
  e("about.principle1.title", "about", "Principle 1: title", "line", 60, "Personalised learning"),
  e("about.principle1.body", "about", "Principle 1: text", "text", 250, "Plans respond to how each ward learns, what they need now and where they want to go next."),
  e("about.principle2.title", "about", "Principle 2: title", "line", 60, "Qualified educators"),
  e("about.principle2.body", "about", "Principle 2: text", "text", 250, "Every tutor is assessed, trained and supported as part of one coordinated team."),
  e("about.principle3.title", "about", "Principle 3: title", "line", 60, "Honest progress"),
  e("about.principle3.body", "about", "Principle 3: text", "text", 250, "Parents receive tracked progress and clear reporting, not vague promises."),
  e("about.motto", "about", "Closing line", "line", 120, "{motto}"),

  // Pricing
  e("pricing.hero.title", "pricing", "Page headline", "line", 100, "Tutoring planned around your child. Priced to fit."),
  e(
    "pricing.hero.intro",
    "pricing",
    "Page introduction",
    "text",
    300,
    "Every learner is different, so every plan is too. We start by understanding where your child is today, then build a programme and a fee that fit their goals, your schedule and your budget.",
  ),
  e(
    "pricing.rate.note",
    "pricing",
    "Note under the rate",
    "text",
    400,
    "That is where we start, not a one-size-fits-all price. Your child's fee depends on four things, and we only discuss it after their assessment, so you pay for exactly what they need.",
  ),
  e("pricing.factors.heading", "pricing", "What shapes the fee: heading", "line", 80, "What shapes your fee"),
  e(
    "pricing.factors.items",
    "pricing",
    "What shapes the fee: items",
    "lines",
    1000,
    "Curriculum | Ghana Education Service, Cambridge, Edexcel, IB or Canadian: each has its own content and exam demands, so we match a tutor who knows yours.\nIn-person or online | Learn at home with a tutor beside you, or online from wherever you are. Pick the mode that fits your family's week.\nNumber of hours | A few focused sessions to master one topic, or a steady weekly plan for lasting progress. We shape the hours around your goal.\nLocation | Where in-person lessons take place is part of the fee, and we tell you exactly how before you commit.",
    { help: "One item per line, written as: Title | Description. The first four lines get the picture icons shown on the page." },
  ),
  e("pricing.assessment.heading", "pricing", "Assessment: heading", "line", 80, "Assessment first. Fees second."),
  e(
    "pricing.assessment.body",
    "pricing",
    "Assessment: text",
    "text",
    600,
    "Before any fee is discussed or negotiated, every learner is assessed. We find out what your child already knows, where the gaps are and how they learn best. Only then do we recommend a plan and talk about the fee, so you never pay for guesswork.",
  ),
  e("pricing.how.heading", "pricing", "How it works: heading", "line", 80, "Four simple steps"),
  e(
    "pricing.how.steps",
    "pricing",
    "How it works: steps",
    "lines",
    1000,
    "Tell us about your child: level, subjects, curriculum and goals. One WhatsApp message is enough to begin.\nAssessment: we assess your child before any fee is discussed, so the plan is built on facts, not guesses.\nYour plan and fee: we recommend a tutor and programme, then propose a fee that reflects curriculum, mode, hours and location. It is negotiable and agreed with you before the first lesson.\nStart learning: pay as agreed and receive confirmation of every payment. We keep you updated on progress.",
    { help: "One step per line. Keep four steps." },
  ),
  e("pricing.promise.heading", "pricing", "Why families choose us: heading", "line", 80, "Why families choose TMP"),
  e(
    "pricing.promise.items",
    "pricing",
    "Why families choose us: items",
    "lines",
    700,
    "No surprises: you know the fee before the first lesson.\nA plan built on assessment, not guesswork.\nTutors matched to your child's curriculum and goals.\nHonest progress updates, and a direct line to TMP, not just the tutor.\nSimple payment by Mobile Money, with confirmation every time.",
    { help: "One promise per line. Only list things TMP really does." },
  ),
  e("pricing.paying.heading", "pricing", "Paying: heading", "line", 80, "Paying"),
  e(
    "pricing.paying.body",
    "pricing",
    "Paying: text",
    "text",
    900,
    "All fees are in Ghana cedis (GH₵). You can pay by {momo} to our MoMo number, {momo_number}. Please confirm the payment details with us on WhatsApp before you send money, and keep your payment confirmation. Online payment through Paystack, including MTN Mobile Money and cards, is being set up; TMP never sees or stores your card number or Mobile Money PIN.",
    { help: "Update this when online payment goes live." },
  ),
  e("pricing.other.heading", "pricing", "Other programmes: heading", "line", 80, "Other programmes"),
  e(
    "pricing.other.body",
    "pricing",
    "Other programmes: text",
    "text",
    500,
    "Group programmes such as Final Lap and Pre-SHS Launchpad, and consulting for schools, are priced per engagement. Ask us for a quote.",
  ),
  e("pricing.cta.heading", "pricing", "Closing call to action: heading", "line", 90, "Ready to find out what your child needs?"),
  e(
    "pricing.cta.body",
    "pricing",
    "Closing call to action: text",
    "text",
    300,
    "Message us to arrange your child's assessment. It takes a minute to start, and you will know the plan and the fee before the first lesson.",
  ),

  // Graphing Studio
  e(
    "graphing.url",
    "graphing",
    "Graphing Studio address",
    "line",
    300,
    "https://frontend-iota-lac-92.vercel.app/",
    { help: "The web address visitors are sent to. It must start with https:// and opens in a new tab. Change it here if the studio moves.", validate: httpsUrl },
  ),
  e("graphing.home.kicker", "graphing", "Home page feature: small label", "line", 30, "Try it now"),
  e("graphing.home.heading", "graphing", "Home page feature: heading", "line", 80, "TMP Graphing Studio"),
  e(
    "graphing.home.body",
    "graphing",
    "Home page feature: text",
    "text",
    300,
    "Plot equations, draw geometry and build statistical charts right in your browser. A hands-on maths tool made by TMP for learners and teachers: practise, explore and watch the idea click.",
  ),
  e("graphing.button", "graphing", "Open button", "line", 40, "Open the Graphing Studio"),
  e("graphing.home.more", "graphing", "Home page feature: link to the page", "line", 40, "See what's inside"),
  e("graphing.hero.title", "graphing", "Page headline", "line", 100, "Maths you can see and explore"),
  e(
    "graphing.hero.intro",
    "graphing",
    "Page introduction",
    "text",
    300,
    "TMP Graphing Studio is an interactive maths tool built by TMP for teachers and learners. Draw, plot and chart in your browser, then use it alongside your lessons.",
  ),
  e("graphing.features.heading", "graphing", "Features: heading", "line", 80, "What's inside"),
  e(
    "graphing.features.items",
    "graphing",
    "Features: items",
    "lines",
    900,
    "Drawing instruments | Draw lines, circles and angles with on-screen instruments.\nGraph paper | Work on clean graph paper, just like in the exercise book.\nEquation plotting | Type an equation and watch its graph appear.\nStatistical charts | Turn data into charts that are easy to read and explain.\nGeometric constructions | Build and explore constructions step by step.",
    { help: "One feature per line, written as: Title | Description. Only list what the studio really does." },
  ),
  e("graphing.audience.heading", "graphing", "Who it is for: heading", "line", 80, "Made for teachers and learners"),
  e(
    "graphing.audience.body",
    "graphing",
    "Who it is for: text",
    "text",
    500,
    "Use it to see why an answer is right, explore how a graph changes, prepare class examples or practise before an exam. It sits alongside TMP lessons and opens from any browser.",
  ),
  e("graphing.cta.heading", "graphing", "Closing call to action: heading", "line", 90, "Ready to explore?"),
  e("graphing.cta.body", "graphing", "Closing call to action: text", "text", 300, "The studio opens in a new tab. Come back to TMP any time to find a tutor or a resource."),

  // Contact
  e("contact.hero.title", "contact", "Page headline", "line", 100, "Let's make the next stage clearer"),
  e("contact.hero.intro", "contact", "Page introduction", "text", 300, "Tell us about your ward, school and goals."),
  e("contact.momo.note", "contact", "MoMo note", "text", 300, "For fees you have agreed with us. Please confirm payment details with us on WhatsApp before sending money."),
  e("contact.where", "contact", "Where we work", "text", 300, "Ghana (home tuition) and online for learners anywhere."),

  // Footer
  e("footer.blurb", "footer", "Footer line", "line", 160, "Educational services in {country} since {founded}."),

  // Policies
  e(
    "legal.terms",
    "policies",
    "Terms of service",
    "rich",
    12000,
    `Last updated 4 November 2026. By using this website or our services you agree to these terms.

## 1. Who we are

{name} ("TMP", "we") provides tutoring, exam preparation and educational consulting in {country} and online. Contact: [{email}](mailto:{email}).

## 2. Our services

We match learners with qualified tutors and run programmes as described on this website. We aim for good progress but cannot guarantee particular exam results or grades, which also depend on the learner's effort and many other factors.

## 3. Fees and payment

Tutoring fees are agreed with you before the first session and are quoted in Ghana cedis (GH₵). See [Pricing](/pricing). Cancellations and refunds are covered in our [refund and cancellation policy](/refunds).

## 4. Parents, guardians and learners

If the learner is under 18, a parent or guardian must agree to these terms and arrange payment. Please give us accurate information about the learner and tell us about anything that affects their learning or safety.

## 5. Conduct

Everyone involved, including learners, parents and tutors, is expected to behave respectfully. We may end tutoring arrangements where conduct puts anyone's safety or wellbeing at risk. Lesson materials remain TMP's or its tutors' property and may not be copied or resold without permission.

## 6. Website use

Do not misuse this website, attempt to disrupt it or access it in unauthorised ways. We try to keep it available and accurate, but provide it as is and may change or withdraw content at any time.

## 7. Liability

Nothing limits liability that cannot lawfully be limited. Subject to that, TMP is not liable for indirect or consequential loss arising from use of the website or services.

## 8. Privacy

How we handle personal information is explained in our [privacy policy](/privacy).

## 9. Changes and governing law

We may update these terms; the date above shows the latest version. These terms are governed by the laws of Ghana.

## 10. Contact

Questions about these terms: [{email}](mailto:{email}).`,
    { permission: LEGAL_PERM, help: "Headings start with ##. Links look like [text](/page). Bullets start with - ." },
  ),
  e(
    "legal.privacy",
    "policies",
    "Privacy policy",
    "rich",
    12000,
    `Last updated 4 November 2026.

## Who is responsible

{name} is responsible for the personal information described here. We handle it with regard to Ghana's Data Protection Act, 2012 (Act 843). Contact: [{email}](mailto:{email}).

## What we collect

- **When you contact us** by email, phone or WhatsApp: your name, contact details and what you tell us about the learner (for example level, subjects and schedule).
- **When you become a client**: the learner's name, age or level, school, learning needs, session records and progress reports, and payment records.
- **Payments** are handled by our payment provider, Paystack. We receive confirmation and a payment reference. We do not see or store your card number or Mobile Money PIN.

This website does not currently use advertising or analytics cookies.

## Why we use it

- To reply to you, arrange and deliver tutoring, and report on progress.
- To take payment, keep financial records and meet legal obligations.
- To keep our services safe and to improve them.

## Kaitlyn, our AI assistant

If you use the Kaitlyn chat on this website, the questions you type are sent to a third-party AI provider so it can write a reply, and are saved by us for 90 days so we can improve our answers. Please do not type passwords, card numbers, Mobile Money PINs or other sensitive details into the chat. Kaitlyn cannot see your account, payments or learner records.

## Who we share it with

With the tutor assigned to your ward (only what they need to teach); with service providers who help us run the service, such as payment processing, hosting and email; and where the law requires. We do not sell personal information.

## Children

Most learners are children. We collect information about them from their parent or guardian, and use it only to provide and manage their learning.

## Keeping it safe

We use access controls, encrypted connections and hashed passwords, and limit who can see learner information. No system is perfectly secure, so please tell us at once if you suspect a problem.

## How long we keep it

We keep information for as long as we provide services to you and as needed for our records and legal duties, then delete or anonymise it.

## Your choices

You can ask to see, correct or delete the information we hold about you or your ward, or object to how we use it, by emailing [{email}](mailto:{email}).

## Changes

We will update this page and its date if our practices change.`,
    { permission: LEGAL_PERM, help: "Headings start with ##. Links look like [text](/page). Bullets start with - ." },
  ),
  e(
    "legal.refunds",
    "policies",
    "Refunds and cancellations",
    "rich",
    12000,
    `Last updated 4 November 2026.

## Tutoring sessions

- You can cancel or reschedule a session free of charge with at least 24 hours' notice.
- Cancellations with less than 24 hours' notice, or missed sessions, may be charged at the agreed session rate. We will consider genuine emergencies.
- If TMP or the tutor cancels a session, we will offer a replacement session at a time that suits you, or refund that session.
- If you are not satisfied with a tutor, tell us. We will work with you to resolve it or assign a different tutor.

## Prepaid sessions and programmes

- If you have paid for sessions or a programme that has not been delivered, you can ask for a refund of the undelivered part.
- Sessions or programme days already delivered are not refundable.
- Group programmes (for example Final Lap) may have their own terms, which we will tell you before you pay.

## How to ask for a refund

Email [{email}](mailto:{email}) or message us on WhatsApp ({phone}) with the name of the learner, the payment reference and the reason. We will reply with a decision. Approved refunds are returned to the original payment method (card or Mobile Money). The time it takes to reach you depends on your bank or Mobile Money provider.

## Digital resources

Terms for digital resources and courses will be published here before they go on sale.`,
    { permission: LEGAL_PERM, help: "Headings start with ##. Links look like [text](/page). Bullets start with - ." },
  ),
];

const BY_KEY = new Map(CONTENT_ENTRIES.map((x) => [x.key, x]));
export const getEntry = (key: string) => BY_KEY.get(key);
