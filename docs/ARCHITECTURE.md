# Target Architecture (Decision Record)

Status: **proposed**, not yet implemented. Versions below were checked against official sources on 2026-11-04 where stated; anything marked "verify at install" could not be checked because the package registry was unreachable from the authoring environment.

## Decisions

| Concern | Decision | Why | Evidence / caveat |
|---|---|---|---|
| Framework | Next.js App Router, React, TypeScript (strict) | Single stack replaces Express + EJS + Next 14. | Official blog (2026-11-04): current line is **16.4** (2026-10-06). Next.js now ships a monthly formal security release; the most recent was **2026-11-03**. Install the latest patched 16.4.x and record the exact version in the lockfile. Verify at install. |
| Styling/UI | Tailwind CSS, small in-repo component library (no heavy UI kit) | Reusable, accessible components; control of look. | Palette carried from legacy: cream `#fbf6ea`/`#f3ead7`, gold `#c9983e`, navy `#12243a`; Inter. Verify at install: Tailwind major. |
| Database | PostgreSQL (managed) | Relational integrity for money and academic records. | Local dev and CI use a Postgres container, not SQLite. |
| ORM + migrations | **Prisma** with versioned migrations | ~100 tables; declarative schema, generated types, a migration history the owner can run. Drizzle is a legitimate alternative (closer to SQL); revisit only if Prisma blocks a ledger query. | Verify at install: Prisma major and its Postgres driver requirements. |
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
prisma/             schema.prisma and migrations
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

## Open decisions for the owner

1. Payment provider and merchant account status (Paystack vs Hubtel; who holds the business verification).
2. Hosting platform, region and monthly budget; whether to stay on Fly.io.
3. Email provider and sending domain.
4. Keep or drop the "Kaitlyn" AI assistant (not in the master prompt).
5. Confirmed lesson pricing, commission rate, payout schedule and minimum payout.
6. Real legal text for the seven policy pages, and business contact details to seed.
