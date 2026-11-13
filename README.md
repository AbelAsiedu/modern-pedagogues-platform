# The Modern Pedagogues Platform

Commercial education platform for **The Modern Pedagogues (TMP)**: tutoring operations, learning management, structured programmes, an educational marketplace, e-commerce and Ghana Mobile Money payments.

*Education keeps changing. So do we. — Empowering Lives, Changing Destinies.*

This is a new, independent codebase. The legacy site (`AbelAsiedu/home-tutoring-site`) was used only as a read-only business and functional reference and has not been modified.

## Status

**Foundation, public site, sign-in, admin tools, editable site text, tutor profiles, the Kaitlyn assistant, image uploads and a digital-resources marketplace (TMP and other creators publish free and paid PDFs behind a quality review) are built. Online (Paystack) payment for shop orders is built and a live Mobile Money payment has been reported to work; other cases were only tested against a stand-in. Learning portals, booking and courses are not built yet.**

| Area | State |
|---|---|
| Legacy audit, architecture ([TECHNICAL_AUDIT](docs/TECHNICAL_AUDIT.md), [ARCHITECTURE](docs/ARCHITECTURE.md)) | Done |
| Public site: Home, Services, Pricing, About, Contact, Terms, Privacy, Refunds, sitemap, robots, health check | Done (content needs owner review, see [DEPLOYMENT](docs/DEPLOYMENT.md)); shows the MTN MoMo number, no postal address |
| Heroku config (Procfile, app.json, release-phase migrations), Gmail SMTP mailer | Done and run locally in production mode; **not deployed** |
| PostgreSQL schema + migrations: users, roles, sessions, verification/reset tokens, rate limits, audit log, email deliveries, site settings, curricula, levels, subjects | Done |
| Auth services: register, verify email, login (lockout, rate limits), logout, password reset, change password, sessions | Done (service layer, tested) |
| Roles and permissions with privilege-escalation rules | Done |
| Money library (integer pesewas, `bigint`) and marketplace split | Done |
| Seed data and first-super-admin script | Done |
| Sign-in, sign-up, email confirmation, password reset, change password, account page | Done, checked in a real browser |
| Admin area: dashboard, users (search, suspend, restore, roles), audit log, home banners, site text, tutors, Kaitlyn | Done, checked in a real browser |
| Home-page slideshow (admin-managed slides, loops automatically, pause control, reduced-motion safe), animated ultramodern public design, looping resources strip, curricula ticker, optional testimonials | Done, checked in a real browser |
| Admin dashboard: sidebar with groups and icons, "needs attention" counts, quick actions, recent activity; everything on the site editable (business details, menu, page titles, text, slides, tutors, media with Replace picture) | Done, checked in a real browser |
| Admin-editable site text: home, services, tutors, about, pricing, contact, footer, Kaitlyn's wording, and the terms/privacy/refunds policies (defaults in code, audited, reset-to-default) | Done, checked in a real browser |
| Tutors: public directory with filters and profile pages, rate-limited application form, admin review queue (approve / request changes / reject), profile editing, publish/hide, staff-added tutors, staff-chosen photos | Done, checked in a real browser (photos: tests only); initials are shown when there is no photo |
| Kaitlyn AI assistant: ported gateway (Gemini Interactions, then OpenRouter, then Mistral), admin-managed knowledge, chat widget, chat log and unanswered-question list, kill switch | Done and checked end to end **with a local stand-in for the AI provider**. **No real provider has been called**: it stays off until you set a key |
| Redesign: blue, yellow and white look with serif headlines, navy header and footer, curved hero, service cards, tutor cards, impact figures, testimonials and closing banner; every picture is placed from Admin > Site images (built-in illustrations until then); optional social icons; also the favicon, share picture, Kaitlyn's picture, service-card pictures and the About story picture; Resources page filters by subject | Done, checked in a real browser on desktop and phone |
| Media library: staff upload JPEG/PNG/WebP pictures (re-encoded, location data removed, stored in Postgres), used for home banners, tutor photos and shop covers | Done, checked in a real browser (tutor photos covered by integration tests only) |
| Shop for digital resources: staff add products with a PDF and cover, visitors order after signing in, pay with Paystack (Mobile Money or card) or by MoMo by hand, buyer downloads from "My orders" | Done, checked in a real browser. Paystack confirms automatically once `PAYSTACK_SECRET_KEY` is set (one live MoMo payment reported working; the rest tested against a stand-in); otherwise staff confirm by hand with the MoMo transaction ID. No real email has been sent |
| Resources marketplace (`/resources`): TMP and any signed-in visitor who becomes a creator can publish free or paid PDF books, courses, study guides, worksheets and past-question packs. Creators pass automatic requirements, then a reviewer scores a published rubric (3 gates + 5 criteria, value for price on paid items); only approved work is listed. Free: signed-in visitors download at once. Paid: locked until staff confirm the MoMo payment. Creators keep 70%, TMP 30% (fixed per sale); staff record manual MoMo payouts | Done, checked in a real browser (60 steps). **Payment is confirmed by hand and payouts are manual**; terms and payout minimum are drafts for the owner |
| Learning portals, booking, courses | **Not built yet** (next stages) |
| Email | SMTP mailer built (Gmail App Password), unit-tested with a fake transport; **never sent a real email** |
| Remote GitHub repository | Created: AbelAsiedu/modern-pedagogues-platform (**make it private**) |

Deploying: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). See [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) for everything unresolved, [docs/SECURITY.md](docs/SECURITY.md) for what is actually enforced, and [docs/TESTING.md](docs/TESTING.md) for how verification works.

## Run it

Requirements: Node >= 22.12, PostgreSQL 16.

```bash
cp .env.example .env            # then edit DATABASE_URL / TEST_DATABASE_URL
npm install
npm run db:migrate              # forward-only SQL migrations
npm run db:seed                 # roles, curricula, levels, default settings (idempotent)
npm run admin:create -- you@example.com "Your Name"   # prints a one-time password-set link
npm run dev
```

Quality gates (all must pass): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. `npm test` needs a disposable PostgreSQL database named `*_test` in `TEST_DATABASE_URL`; it is **wiped on every run** and the suite fails loudly if it is not configured.

## Decisions recorded

Paystack is the first payment provider (MTN Mobile Money is the first network; account registration in progress, so test mode only). Hosting is Heroku (Basic dyno + Postgres Essential-0, about US$12/month). Email is Gmail SMTP for now. Marketplace commission default is 30% (creators keep 70%), editable in settings. Tutoring rates are negotiable per learner, starting from GHS 100 per session (stored as 10000 pesewas in the `tutoring.indicative_rate` setting). The Kaitlyn AI assistant is kept; it is optional and switched off until an AI provider key is configured. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
