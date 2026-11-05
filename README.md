# The Modern Pedagogues Platform

Commercial education platform for **The Modern Pedagogues (TMP)**: tutoring operations, learning management, structured programmes, an educational marketplace, e-commerce and Ghana Mobile Money payments.

*Education keeps changing. So do we. — Empowering Lives, Changing Destinies.*

This is a new, independent codebase. The legacy site (`AbelAsiedu/home-tutoring-site`) was used only as a read-only business and functional reference and has not been modified.

## Status

**Foundation, public site, sign-in and the first admin tools are built. Tutors, marketplace, Kaitlyn and the rest of the old site's features are not built yet.**

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
| Admin area: dashboard, users (search, suspend, restore, roles), audit log, home banners | Done, checked in a real browser |
| Home-page hero slideshow (admin-managed banners, accessible, 3 default slides) | Done |
| Tutors page and applications, marketplace, Kaitlyn, portals, booking, courses, shop, payments | **Not built yet** (next stages) |
| Email | SMTP mailer built (Gmail App Password), unit-tested with a fake transport; **never sent a real email** |
| Remote GitHub repository | **Not created** (see below) |

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

## Create the remote (run on a machine with `gh` authenticated as `AbelAsiedu`)

The session that built this could not reach GitHub (invalid token), so the remote was neither checked nor created. Check first; if it already exists, stop and do not push.

```bash
gh repo view AbelAsiedu/modern-pedagogues-platform && echo "ALREADY EXISTS - stop" || echo "free to create"
gh repo create AbelAsiedu/modern-pedagogues-platform --private --source=. --remote=origin --push
```

Without `gh`: create an empty private repo in the GitHub UI (no README/.gitignore/licence), then `git remote add origin https://github.com/AbelAsiedu/modern-pedagogues-platform.git && git push -u origin main`. Nothing here pushes to, or depends on, `home-tutoring-site`.

## Decisions recorded

Paystack is the first payment provider (MTN Mobile Money is the first network; account registration in progress, so test mode only). Hosting is Heroku (Basic dyno + Postgres Essential-0, about US$12/month). Email is Gmail SMTP for now. Marketplace commission default is 30% (creators keep 70%), editable in settings. Tutoring rates are negotiable per learner, starting from GHS 100 per session (stored as 10000 pesewas in the `tutoring.indicative_rate` setting). The Kaitlyn AI assistant is kept as an optional later module. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
