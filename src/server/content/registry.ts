import { SERVICES } from "@/lib/site";

/**
 * Every piece of site text an administrator can edit. The `default` is what visitors see until an editor
 * changes it, and what they see again if an edit is reset. Defaults live in code so the site is complete
 * on a brand-new database and never shows a blank page.
 *
 * Text may use {tokens} (see TEMPLATE_VARS in lib/site-content) and, where kind is "rich", the small markup
 * described in lib/richtext.ts.
 */

export type ContentKind = "line" | "text" | "lines" | "rich";
export type ContentGroupId = "home" | "services" | "tutors" | "assistant" | "shop" | "about" | "pricing" | "contact" | "footer" | "policies";

export type ContentEntry = {
  key: string;
  group: ContentGroupId;
  label: string;
  kind: ContentKind;
  max: number;
  default: string;
  help?: string;
  /** Policies need the legal permission; everything else needs the site permission. */
  permission: "content.manage_site" | "content.manage_legal";
};

export const CONTENT_GROUPS: readonly { id: ContentGroupId; label: string; blurb: string }[] = [
  { id: "home", label: "Home page", blurb: "Text under the slideshow. Edit the slides themselves under Home banners." },
  { id: "services", label: "Services page", blurb: "The service descriptions here also appear on the home page." },
  { id: "tutors", label: "Tutors pages", blurb: "Wording around the tutor directory and the tutor application. Tutor profiles themselves are edited under Tutors." },
  { id: "assistant", label: "Kaitlyn (chat assistant)", blurb: "The words around the chat window. What Kaitlyn knows is edited under Kaitlyn in the admin menu." },
  { id: "shop", label: "Resources", blurb: "Wording on the Resources pages (browse, quality standards, becoming a creator) and the payment steps shown to buyers. The resources themselves are edited under Resources in the admin menu." },
  { id: "about", label: "About page", blurb: "Who we are and what we stand for." },
  { id: "pricing", label: "Pricing page", blurb: "The rate itself comes from site settings, not from this text." },
  { id: "contact", label: "Contact page", blurb: "Phone, email and MoMo numbers are fixed business facts and are not edited here." },
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
  extra: { help?: string; permission?: ContentEntry["permission"] } = {},
): ContentEntry {
  return { key, group, label, kind, max, default: def, help: extra.help, permission: extra.permission ?? SITE_PERM };
}

const SERVICE_ENTRIES = SERVICES.flatMap((s, i) => [
  e(`services.${i + 1}.title`, "services", `Service ${i + 1}: name`, "line", 80, s.title),
  e(`services.${i + 1}.body`, "services", `Service ${i + 1}: description`, "text", 400, s.body),
]);

export const CONTENT_ENTRIES: readonly ContentEntry[] = [
  // Home
  e("home.pillar1.title", "home", "Highlight 1: title", "line", 60, "Pre-school to SHS"),
  e("home.pillar1.body", "home", "Highlight 1: text", "text", 200, "Support at every stage of a learner's journey."),
  e("home.pillar2.title", "home", "Highlight 2: title", "line", 60, "Ghanaian and international"),
  e("home.pillar2.body", "home", "Highlight 2: text", "text", 200, "GES, Cambridge / British, Pearson Edexcel, IB and Canadian curricula."),
  e("home.pillar3.title", "home", "Highlight 3: title", "line", 60, "Tracked progress"),
  e("home.pillar3.body", "home", "Highlight 3: text", "text", 200, "Honest reporting every term, and a direct line to TMP, not just the tutor."),
  e("home.services.heading", "home", "Services section heading", "line", 80, "What we do"),
  e("home.fees.heading", "home", "Fees section heading", "line", 80, "Fees that fit the learner"),
  e(
    "home.fees.body",
    "home",
    "Fees section text",
    "text",
    500,
    "Tutoring fees are agreed per learner, depending on level, subjects and schedule. Sessions start from {rate} per session, and we confirm the rate with you before the first lesson.",
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
    "Send the amount shown by {momo} to {phone}.\nUse your order reference as the payment reference.\nWe confirm payments personally, usually within a few hours. Your download then appears under My orders.",
    { help: "One step per line. {momo} and {phone} are filled in automatically." },
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
  e("pricing.hero.title", "pricing", "Page headline", "line", 100, "Fair fees, agreed up front"),
  e("pricing.hero.intro", "pricing", "Page introduction", "text", 300, "No hidden charges. You know the rate before the first lesson."),
  e(
    "pricing.rate.note",
    "pricing",
    "Note under the rate",
    "text",
    400,
    "Rates are negotiable and depend on the learner's level, subjects, curriculum, location (home or online) and how often sessions run.",
  ),
  e("pricing.how.heading", "pricing", "How it works: heading", "line", 80, "How it works"),
  e(
    "pricing.how.steps",
    "pricing",
    "How it works: steps",
    "lines",
    800,
    "Tell us about your ward: level, subjects, curriculum, goals and schedule.\nWe recommend a tutor and programme, and propose a rate per session.\nYou and TMP agree the rate and schedule before the first lesson.\nPayment is made as agreed; you receive confirmation of each payment.",
    { help: "One step per line." },
  ),
  e("pricing.paying.heading", "pricing", "Paying: heading", "line", 80, "Paying"),
  e(
    "pricing.paying.body",
    "pricing",
    "Paying: text",
    "text",
    900,
    "All fees are in Ghana cedis (GH₵). You can pay by {momo} to our MoMo number, {phone}. Please confirm the payment details with us on WhatsApp before you send money, and keep your payment confirmation. Online payment through Paystack, including MTN Mobile Money and cards, is being set up; TMP never sees or stores your card number or Mobile Money PIN.",
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
