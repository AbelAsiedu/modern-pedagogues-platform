# Target Architecture (Decision Record)

Status: **proposed**, not yet implemented. Versions below were checked against official sources on 2026-11-04 where stated; anything marked "verify at install" could not be checked because the package registry was unreachable from the authoring environment.

## Decisions

| Concern | Decision | Why | Evidence / caveat |
|---|---|---|---|
| Framework | Next.js App Router, React, TypeScript (strict) | Single stack replaces Express + EJS + Next 14. | Official blog (2026-11-04): current line is **16.4** (2026-10-06). Next.js now ships a monthly formal security release; the most recent was **2026-11-03**. Install the latest patched 16.4.x and record the exact version in the lockfile. Verify at install. |
| Styling/UI | Tailwind CSS, small in-repo component library (no heavy UI kit) | Reusable, accessible components; control of look. | Palette carried from legacy: cream `#fbf6ea`/`#f3ead7`, gold `#c9983e`, navy `#12243a`; Inter. Verify at install: Tailwind major. |
| Database | PostgreSQL (managed) | Relational integrity for money and academic records. | Local dev and CI use a Postgres container, not SQLite. |
| ORM + migrations | **Drizzle ORM + drizzle-kit** with plain-SQL, forward-only migrations in `drizzle/` | Changed from Prisma during Phase 2: Prisma's engine binaries are fetched from `binaries.prisma.sh`, which the build environment's egress policy denied, so Prisma migrations could not be generated or verified. Drizzle has no native binary, emits reviewable SQL, and lets DB-level guarantees (CHECKs, triggers) live in ordinary migration files. Trade-off: less tooling around the schema than Prisma. | Exact versions pinned in `package.json`. |
| Validation | Zod schemas shared by forms and server actions | One definition per input; mass-assignment protection. | |
| Auth | Self-contained sessions: random opaque token, SHA-256 hash stored in Postgres, `HttpOnly; Secure; SameSite=Lax` cookie, Argon2id passwords, email verification and reset tokens (hashed, single use, short expiry), per-IP and per-account rate limits | Removes the legacy tab-session, shared-admin and fallback-secret designs; no framework lock-in. Google sign-in is added later as an optional provider. | |
| Authorization | Permission-based (`finance.refund`, `academic.assign_tutor`, …), roles are bundles of permissions; every server action calls `authorize(user, permission, resource)` | Prompt requires no automatic super-powers for `Administrator`. Ownership checks (parent→child, tutor→assigned student, creator→own content) live in one module with tests. | |
| Storage | S3-compatible (Cloudflare R2 already used by legacy), **private bucket by default**, random keys, presigned short-lived URLs issued after an authorisation check, separate public bucket for images only | Fixes public upload directory. Magic-byte content sniffing in addition to extension and MIME. | |
| Email | Provider behind an interface; SMTP via Nodemailer `createTransport` as baseline; delivery log + retry | Legacy `createTransporter` bug avoided. Provider choice (Resend/Postmark/SES/other) is an owner decision. | |
| Payments | `PaymentProvider` interface (initiate, verify, handleWebhook, refund?, status) with **Paystack** as adapter #1; Hubtel as a candidate adapter #2 once its API is reviewed | See "Payments" below. | |
| Money | Integer **pesewas** (GHS minor unit) in every column and calculation; currency column on every amount | Prompt forbids floats; future currencies. | Confirm minor-unit conventions in Paystack docs at integration time. |
| Logging | Structured JSON (pino) with request ids, secrets redacted | | |
| Tests | Vitest (unit/integration against real Postgres), Playwright (journeys A-F plus security cases) | Matches prompt Part 22. | Verify at install. |
| Hosting | Needs a Node runtime, managed Postgres, S3-compatible storage, HTTPS. Candidate hosts: Fly.io (already used), Render, Railway, or a VPS; Vercel is workable only with external Postgres and storage. Final choice, region and cost are owner decisions. | Do not assume frontend-only hosting covers webhooks, background jobs and large uploads. | |

## Payments (Ghana Mobile Money)

Verified from official or documentation sources during this audit:

- Paystack's support documentation states Mobile Money is available for Ghana on **MTN, Airtel/Tigo and Telecel (formerly Vodafone)**; the customer receives a prompt on their phone and approves with a one-time code and their MoMo PIN; the phone number must be MoMo-enabled; **recurring payments are not supported**; the stated transaction charge on that page is **1.95%** (confirm the current Ghana pricing page before quoting to the owner).
- Paystack webhooks are signed with `x-paystack-signature`, an **HMAC-SHA512 of the raw request body** keyed with the secret key, hex-encoded; the signature has **no timestamp**, so replay protection must come from idempotent processing keyed on event + reference. The recommended pattern is verify signature → call Paystack's verify endpoint to confirm amount/status → fulfil. Live retries run for up to 72 hours.
- Hubtel's public checkout page lists mobile money, cards, GHQR and the Hubtel wallet, but the page retrieved did not document credentials, payment confirmation or signature verification. **Hubtel is therefore not yet evaluated.**

Not verifiable from here and required before go-live: Paystack (or any provider) **business verification and approved Ghana merchant account**, live API keys, and written confirmation of which MoMo networks are enabled on that account. Until then the code will run only in provider test mode, and the checkout will refuse to start a live payment when credentials are missing.

Invariants (enforced by tests): an order becomes `paid` only from a verified provider result with matching amount, currency and reference; webhooks are idempotent; the browser redirect is never trusted; missing configuration fails closed; creator earnings are ledger rows with `estimated` vs `payable` states.

## Module layout

```
src/app/            routes and layouts (public, auth, portal/*, admin/*)
src/components/     ui kit and shared components
src/features/       business modules: academic, tutoring, lms, programmes, marketplace, commerce, cms
src/server/         auth, permissions, payments (adapters), storage, notifications, audit, db
src/lib/            pure utilities (money, dates, ids)
drizzle/            SQL migrations (0000 generated, 0001 hand-written audit triggers, 0002 generated)
src/server/db/schema/  Drizzle table definitions
tests/              unit, integration, e2e
docs/               audit, architecture, runbooks
```

## Build order (from the master prompt, adjusted)

1. Foundation: project, env validation, DB schema + migrations (identity, permissions, audit), auth, permission layer, money library, error handling, logging.
2. Public site and CMS.
3. Accounts and dashboards; academic operations.
4. LMS and programmes.
5. Marketplace and commerce.
6. Payments (Paystack adapter, webhooks, reconciliation) then admin control centre and reports.
7. Notifications, analytics, accessibility and performance pass, security review, deployment docs and go-live runbook.

Each phase ends with passing lint, type-check, tests and a build before its commit.

## Owner decisions recorded (2026-11-04)

1. **Payments:** the owner has a Paystack account. Paystack is therefore the first adapter and Hubtel is deferred. Whether the account is business-verified and live, and which Mobile Money networks are enabled on it, is **not yet confirmed**; until it is, development and CI use Paystack test mode only.
2. **Tutoring rates are negotiable and can start as low as GHS 100 per session.** Consequences for the design:
   - There is no fixed public price list. A tutoring booking stores its own agreed rate (`rate_pesewas`, `currency`, who set it, when, and why changed), with a configurable *indicative starting rate* (default 10000 pesewas = GHS 100) used only as the displayed "from" figure.
   - Rate changes on a booking are permission-gated (`finance.set_rate` or `academic.set_rate`) and written to the audit log.
   - Public pages say "from GHS 100 per session, rates agreed per learner" only while an admin has that setting enabled; nothing is hard-coded in components.
3. **Kaitlyn AI assistant is kept** as an optional module, built after the core platform (it is not in the master prompt's acceptance list):
   - Answers come from admin-managed, published company knowledge (the legacy `ai_company_*` idea), served through an `LlmProvider` interface so the model vendor can change.
   - It must not quote prices other than the admin-published indicative rate, and must say rates are negotiable; it hands off to staff for anything it does not know or any account-specific action.
   - It has no access to student, parent, payment or tutor records. Conversation logs are retention-limited and exclude personal data where practical, given minors are users.
   - It is disabled by default until a provider key is configured, and fails closed (a "contact us" message) when the provider is unavailable.
   - **Built (2026-11-06):** `src/server/assistant/` (guard, providers, knowledge, service), `/api/chat`, the chat widget and `/admin/assistant`. Provider order is Gemini Interactions, OpenRouter, Mistral. Knowledge is the public page text, published tutor profiles and admin notes (`assistant_knowledge`), not a dump of every content key as in the legacy site. Chat logs hold no IP or account and are purged after 90 days.
   - **Site text and tutors (2026-11-06):** admin-editable text lives in `site_content` as overrides of code-level defaults (`server/content/registry.ts`). Tutor applications and public profiles share the `tutor_profiles` table with explicit public/private columns.

## Open decisions for the owner

1. Is the Paystack account business-verified with live keys? Which MoMo networks are enabled? (Required before any live payment.)
2. Hosting platform, region and monthly budget; whether to stay on Fly.io.
3. Email provider and sending domain.
4. LLM provider and key for Kaitlyn: the code supports Gemini, OpenRouter and Mistral; the owner must choose one and supply a key (legacy `.env.example` lists Gemini, OpenRouter, Mistral and Hugging Face options).
5. Marketplace payout schedule and minimum payout (a draft of GH₵ 50 and 14 days is in the Creator terms; the commission itself is settled at 30%).
6. Real legal text for the seven policy pages, and business contact details to seed.

## Owner decisions recorded (2026-11-04, second round)

- First Mobile Money network: **MTN**. Paystack registration needs the live website; deploying is the unblocker.
- Business email and mail sender: `themodernpedagogues@gmail.com` through Google SMTP (App Password) for now.
- Hosting: **Heroku**, base paid plan: Basic dyno + Heroku Postgres Essential-0 (about US$12/month). See DEPLOYMENT.md.
- Marketplace commission: "the average" interpreted as **30%** to TMP (creators keep 70%), payment-provider fee paid from TMP's share. Stored as the `marketplace.commission` setting, applied from Phase 8. Evidence: Gumroad 10% direct and 30% via Discover; Udemy keeps 63% of organic sales (the Udemy figure comes from an instructor-review article and Gumroad's from a competitor's blog; verify against each platform's own pages before relying on them).

## Resources marketplace (built 2026-11-06)

- Tables: `products` (now every resource; `owner_id` null means TMP's own; `status` DRAFT, IN_REVIEW, CHANGES_REQUESTED, APPROVED, REJECTED, SUSPENDED; `pending_file_id` holds a creator's unreviewed replacement), `product_files` (bytea, page count, inspection notes), `resource_reviews` (every decision with rubric version and scores), `creator_profiles`, `creator_payouts`, and the split columns on `orders`. Migration `0010` marks existing products APPROVED.
- Code: `src/server/resources/` (`quality.ts` the rules and rubric as data and pure functions; `pdf.ts` the file inspection; `creators.ts` profile, listings, readiness, submission, earnings; `review.ts` queue, decision, take-down; `payouts.ts`; `taxonomy.ts`), `src/server/shop/service.ts` (catalogue, orders, downloads, uploads). Pages: `/resources`, `/resources/[slug]`, `/resources/standards`, `/creator/*`, `/admin/review`, `/admin/creators`.
- Publication rule enforced twice (service and a database CHECK): visible only when `status = APPROVED`, `is_published` and a file exists.
- Not built: buyer reviews/ratings, versioned updates for buyers, bundles, Paystack (all payments still confirmed by hand).

## Stage 5: editable everything and the new look (2026-11-06)
- **Business facts live in the text registry** (`site.*` keys, group "business"). `buildSiteText` derives `t.biz` (name, motto, email, phone, `tel:` and `wa.me` forms, MoMo) from the stored values and the `{name} {email} {phone} {momo} {momo_number} {motto}` tokens use them. `src/lib/site.ts` (`SITE`) now only supplies the defaults. Server code that used `SITE` (order and application alert emails, Kaitlyn's knowledge and fallback, the MoMo payment email) reads `loadSiteText(db).biz` instead.
- **Registry entries gained `validate` and `optional`.** `saveContentGroup` runs a validator on any non-empty typed value; an empty value still means "use the default". `optional` allows an intentionally empty default (testimonials).
- **Per-page SEO** comes from `seo.<page>.title/description` through `src/server/seo.ts`; the root layout's `generateMetadata` supplies the business name and title template (the root layout is therefore dynamic).
- **Motion**: CSS-only animations in `globals.css` (`.reveal`, `.rise`, `.blob`, `.marquee-track`, `.kb-img`, `.progress-fill`), all disabled under `prefers-reduced-motion`. `Reveal` leaves content visible from the server and only prepares below-the-fold items to animate. `useAutoplay` is the one timer behind the home slideshow and the testimonials: it loops forever, keeps time when paused, pauses for a resting mouse and a hidden tab but never for focus, and a pressed control overrides hover.
- **Admin shell**: sidebar with groups and icons (`AdminNav`, closes on navigation, collapses to a menu button on phones). The dashboard is `adminOverview()` (`src/server/admin/overview.ts`): counts limited to what the role may open.
- **Media**: `replaceMedia` (new row, move usages, delete old, one transaction); the upload route accepts `replaceId`.

