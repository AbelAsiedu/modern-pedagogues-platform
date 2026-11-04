# Technical Audit of the Legacy Site (`AbelAsiedu/home-tutoring-site`)

Audited: 2026-11-04. Commit inspected: `ff5a1cdf798e8d1a2a1e914331fe5069c99491d4` (`main`, shallow clone, read-only).

This is a verified-by-source audit, not a reading of the README. Where documentation and code disagree, the code is treated as the truth. Findings cite `file:line` in the legacy repo so they can be re-checked.

## 0. Coverage and limits

Read in full or in the relevant sections: `package.json`, `frontend/package.json`, `frontend/next.config.js`, `README.md`, `MARKETPLACE.md`, `GO_LIVE_RUNBOOK.md` (first 80 lines), `lib/security-hardening.js`, `lib/email.js`, `lib/r2-storage.js`, `lib/tutor-application-override.js` (first 90 lines plus a status grep), `lib/marketplace.js` (earnings), `frontend/pages/api/lms.js`, `frontend/components/LmsPortalV2.js`, `frontend/pages/{index,about,curriculum}.js`, `tests/api.lessons.test.js`, `scripts/production-gate.js`, `.github/workflows/production-gate.yml`, `fly.toml`, `Dockerfile`, `.env.example`, and about 900 of the 3,124 lines of `server.js` (routes list, session/CORS/CSRF, auth, admin login, user admin, checkout, lessons API, marketplace purchase and webhook).

Not read: the rest of `server.js` (Kaitlyn AI chat at ~823-960, admin content/media/export handlers), most `views/*.ejs`, `tools/llm.js`, `COST_PLAN.md`, `PRODUCTION_READY.md` and the other long markdown files, `frontend/pages/*` other than the three above. Nothing was executed: no dependencies could be installed in the audit session (see README, "Status"), so claims below are from static reading, not runtime behaviour.

## 1. Existing technical architecture

- One Express 4 process (`server.js`, 3,124 lines) owns routing, sessions, EJS views, uploads, payments and admin. A Next.js **14.0.0** app in `frontend/` is mounted behind it via `nextHandle` for some pages and API routes (`server.js:3079-3080`).
- Two UI stacks coexist: ~40 EJS views (`views/`) and ~25 Next.js pages (`frontend/pages/`). Public pages are Next.js; admin, marketplace, cart and account pages are EJS.
- Data: SQLite (`data.db`) or PostgreSQL behind one adapter (`lib/db.js`). `fly.toml` sets `DATABASE_PATH=/data/data.db`, so the Fly.io deployment config points at SQLite on a volume unless `DATABASE_URL` is supplied as a secret (not visible in the repo).
- Sessions: `connect-sqlite3`; `lib/security-hardening.js` swaps in a Postgres store when `DATABASE_URL` is set.
- Hosting config: `Procfile` (`web: npm start`), `Dockerfile`, `fly.toml` (region `lhr`), GitHub Actions `fly-deploy.yml` and `production-gate.yml`.
- Dependencies of note: express 4, stripe 12, multer 1.x, nodemailer 7, bcrypt, `csurf` (deprecated) alongside `csrf-csrf`, `puppeteer` and a package literally named `chocolatey` in runtime dependencies. There is no `test` script and no jest/supertest in `package.json`.

## 2. Actual business functionality (what the code really does)

| Area | State in code |
|---|---|
| Public site | Home, About, Curriculum, FAQ, Contact, Tutors, Apply, estore pages. Copy is strong and reusable (see section 3). |
| Content admin | `site_content` key/value table (`hero_banners_json`, `home_slide_1..3`, `about_slide_1`, `curriculum_slide_1`, `ai_company_*`). Admin pages for content, media, messages, products, orders, users, applications. |
| Tutor recruitment | Application form with required CV, private CV storage outside the public dir (`private_uploads/tutor-applications`), admin review with status and notes, CV download behind admin auth. Genuinely good. |
| Tutoring ops | `lessons`, `lesson_reports`, `recordings` tables plus a small API. **No** booking workflow, calendar, recurring lessons, attendance, conflict detection or timezone handling. |
| "LMS" | Actually a ward/enrollment/assignment tool: parent creates a ward, admin assigns a tutor, tutor posts assignments, learner submits, tutor grades (`frontend/pages/api/lms.js`). **No** courses, modules, lessons, quizzes, certificates or progress tracking. |
| E-store | Cart in session, products with optional downloadable file, orders table. |
| Marketplace | See section 4. |
| AI assistant | "Kaitlyn": chat endpoint (`/api/chat`) using admin-supplied `ai_company_*` knowledge and external LLM keys. Outside the master prompt's scope; flagged as an owner decision. |
| Pricing | Admin content template seeds `GHS 65 / 150 / 200 per lesson`. These are defaults in an admin form, not confirmed current prices. Must be owner-confirmed and kept configurable. |

Not present at all: programmes/cohorts, Final Lap or Pre-SHS registration, consulting enquiry/client records, parent-child multi-profile management beyond wards, role-based permissions beyond a single `admin` role, notifications beyond a few emails, financial reporting.

## 3. Existing design and branding

- Palette (`public/css/style.css`): cream backgrounds `#fbf6ea` / `#f3ead7`, gold accent `#c9983e`, deep navy `#12243a`. Font: Inter. Hero is a navy gradient over configurable imagery.
- Messages to preserve: "Education keeps changing. So do we."; "Empowering Lives, Changing Destinies."; "Built around the student, not a fixed syllabus."; "Preschool → SHS"; five curricula (GES, Cambridge/British, Pearson Edexcel, IB, Canadian); six services (Home Tuition, Online & International Support, Final Lap Exam Prep, Pre-SHS Launchpad, Curriculum & Assessment Consulting, Tutor Training & Management); "Honest progress", "one coordinated team".
- Established claim: founded 2019 (stated on the site). WhatsApp CTA number is in the source (`wa.me/233593660708`); treat as the owner's current contact but confirm.
- Nav: Home, Curriculum, Marketplace, Tutors, Learning Portal, Enroll Ward, FAQ, Apply, About, Contact, Request a Tutor, Cart.

## 4. Existing marketplace features

Implemented: `marketplace_content`, `marketplace_versions` (free/paid, licence type), `marketplace_favorites`, `marketplace_reviews`, `marketplace_transactions`, `creator_earnings`, seller applications with admin review, creator role, upload, moderation (approve/reject/flag), creator dashboard, free download, paid purchase via Stripe Checkout, reviews, favourites.

Documented but not wired: **packs/bundles** exist only as a library function (`createPack`); no routes expose them. **Payouts** do not exist; docs say "Stripe Connect integration pending". Creator-earnings dashboard is described by the docs as a UI placeholder.

Docs and code disagree on money: `MARKETPLACE.md` says creator receives "~40%"; `lib/marketplace.js:293-307` computes `total − (2.9% × total + $0.30) − 30% × total`, applying the fixed $0.30 once per month rather than per transaction, in USD, with floating-point arithmetic.

## 5. Existing academic and tutoring features

Wards (child profiles) with parent link, enrollments with tutor assignment and status, assignments with file attachment and due date, submissions with text/file, grading with score and feedback. Lessons and lesson reports (summary, homework, progress score) and recording upload. Access to the learning portal requires an active enrollment for students/tutors (`server.js:526-548`). Downloads of assignment/submission files are authorisation-checked (`lib/security-hardening.js:134-160`).

## 6. Existing authentication and administration

- Roles in practice: `admin`, `tutor`/`teacher`, `parent`, `student`, `creator`, `user`. One undifferentiated `admin` role: no finance/academic/content separation, no MFA, no per-action permissions.
- Admin sign-in is special-cased: an environment username/password path and a database path (`server.js:1930-1993`).
- Google OAuth is mentioned in comments and dependencies; no working flow was found in the sections read.
- Audit: `audit_events` logs HTTP method, path, status and query for sensitive-looking routes. It is a request log, not a record of what changed, and the table is writable by the application.

## 7. Existing payment implementation

- Marketplace: Stripe Checkout (card only) with metadata and a webhook that verifies the Stripe signature on the raw body and marks the transaction completed on `payment_status === 'paid'` (`server.js:2955-2983`). The signature handling is correct. Amount and currency are not compared to the transaction, and USD is the default.
- E-store checkout: **not a payment integration** (see weaknesses 1 and 2).
- Mobile Money: no integration. A `momo_number` is collected and stored on the order; nothing charges it. Orders stay `pending` until an admin changes the status by hand (`server.js:1564`).
- Paystack, Hubtel and every Ghana payment provider: absent. Currency strings in views say GHS while Stripe is called with `usd`.

## 8. Weaknesses that must not be carried forward

Severity: **Critical** = money or account takeover; **High** = data exposure or auth weakness; **Medium** = reliability or hygiene.

**Critical**

1. **Card checkout marks orders paid without payment.** `POST /checkout` inserts the order with status `completed` whenever `payment_method === 'card'` (`server.js:1424`) and creates 30-day download links before any charge (`:1429-1438`). If Stripe is unset, the path falls through to the success page (`:1458-1460`). Even when Stripe is set, the order is already `completed` and downloads already issued before the customer pays. Free downloads for anyone who submits the form.
2. **The server receives the raw card number.** `card_number` is read from the request body (`:1408`) and only the last four digits are kept. Raw PANs must never touch application servers outside a PCI-scoped provider flow.
3. **Marketplace purchase succeeds with no payment provider.** If Stripe is not configured the transaction is set `completed` and the premium download unlocks (`server.js:2915-2921`).
4. **Hard-coded fallback secrets.** Session secret falls back to `'very-secret-key'` (`server.js:166`) and the Next.js LMS route re-implements cookie verification with the same fallback (`frontend/pages/api/lms.js:20`). Production is protected only if `lib/security-hardening.js` is preloaded via `-r` in the npm script; `node server.js` directly runs without it.
5. **Admin login weaknesses.** Default non-production password `'passwod'` (`:1935`), a synthetic `admin-1` identity when no admin row exists (`:1947`), and a match rule that accepts `a.id === 'admin-1' || usernameRaw === adminUsername` when selecting the admin row to compare passwords against (`:1968`). One shared credential, no MFA.
6. **Plaintext passwords.** A `plain_password` column was added (`lib/db.js:376`) and later nulled at startup (`server.js:416`). Admin-created accounts email the plaintext password (`:2284`) and echo it in a session flash message (`:2287`).

**High**

7. **Broken access control (IDOR) in the lessons API.** `GET /api/lessons?user_id=` has no authentication and returns any user's lessons (`:1239-1245`). `GET /api/lessons/:id` and `GET /api/dashboard?user_id=` need only a login, not ownership (`:1258`, `:1321`), exposing lesson reports and recordings of children. `POST /api/lessons` lets any logged-in user create lessons for arbitrary tutor and student IDs (`:1225`).
8. **Behaviour depends on monkey-patching.** `lib/security-hardening.js` replaces `multer`, `cors`, `connect-sqlite3` and `express.application.use/listen/download` by overwriting `require.cache`. Correct security behaviour (CORS allowlist, upload filter, session store, `/uploads` restrictions, audit log) exists only when the file is preloaded and in a particular order. The source of truth is split across two files.
9. **CORS reflects every origin with credentials** in source: `cors({ origin: true, credentials: true })` (`:144`), corrected only by the shim above.
10. **Upload validation trusts client metadata.** File filters check extension and client-supplied MIME type, with no content (magic-byte) validation. Uploaded names are derived from the original filename in several paths.
11. **CSRF coverage is inconsistent.** Multipart requests skip the global middleware (`:251-252`); `/marketplace/upload` and `/marketplace/seller/apply` are on the exempt list; the Next.js `/api/lms` route has no CSRF check.
12. **Account enumeration and verification gaps.** Signup reveals "Email already in use" (`:1607`); login never checks `email_verified` (`:1628-1675`); a client-controlled `x-tab-id` header selects which "tab" user context is used (`:183-217`), and some routes read `req.session.user` while others use `req.getUser()`.
13. **Email is probably broken in production.** `lib/email.js:8` and `:21` call `nodemailer.createTransporter`, which is not part of Nodemailer's API (the function is `createTransport`). By inspection this throws as soon as SendGrid or SMTP is configured; it only "works" in the console-logging development fallback. Not confirmed at runtime.

**Medium**

14. **Schema created and altered at startup**, in three places (`lib/db.js`, `scripts/bootstrap-db.js` via `prestart`/`predev`, `lib/tutor-application-override.js`) and inside a request path (`frontend/pages/api/lms.js:18`). No migration history, no rollback, drift risk.
15. **Money stored and computed as floating point** (`price REAL`, `Math.round(price * 100)`, commission with `toFixed`).
16. **Legacy SQLite sessions read directly by a Next.js route** (`lms.js:21-24`), which breaks the moment sessions move to Postgres.
17. **Outdated and risky dependencies.** Next.js 14.0.0 is far behind the 16.x line and predates published advisories (for example CVE-2025-29927, a middleware authorisation bypass fixed in 14.2.25; to be re-verified with `npm audit` once the registry is reachable). `csurf` is deprecated. `chocolatey` and `puppeteer` in runtime dependencies are unexplained. `bcrypt.hashSync` blocks the event loop (`:1598`).
18. **Hard deletes.** `delete_ward` physically deletes assignments, submissions and files (`lms.js` action `delete_ward`) with no soft delete or change record.
19. **Tests do not protect anything.** One test file, no test script or test dependencies in `package.json`, logs in as `tutor@example.com` / `password`, accounts I could not find created in `scripts/bootstrap-db.js` or `lib/db.js` (the only seed code read), and returns early (passes) when no lessons exist. The CI "production gate" checks headers, one auth boundary, a traversal case and a 1,000-request homepage load.
20. **Repository hygiene.** A stray file named `-b` at the repo root; ad hoc scripts (`check_columns.js`, `test_insert.js`) in the root; dozens of overlapping status documents (`PRODUCTION_READY.md`, `DEPLOYMENT_SUMMARY.md`, …) that describe features the code does not implement.

## 9. Recommended architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md). In one paragraph: a single Next.js (current 16.x) App Router application in TypeScript with PostgreSQL and a migration-based ORM, server-side services behind typed validation, a self-contained session layer with Argon2id, S3-compatible private object storage, a payment-provider adapter interface with **Paystack** as the first adapter (Ghana Mobile Money), and a ledger-style money model in integer pesewas. No Express, no EJS, no shim layer.
