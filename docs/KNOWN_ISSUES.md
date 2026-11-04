# Known issues and open items

| # | Item | Impact | Next action |
|---|---|---|---|
| 1 | GitHub remote not created; session token invalid | Repo exists only as local git history/bundle | Owner runs the commands in README |
| 2 | Playwright browsers likely cannot be downloaded in the build environment | No E2E tests yet | Revisit when pages exist; may need CI |
| 3 | `npm audit`: 12 moderate advisories, all dev-tooling (old `esbuild` inside `drizzle-kit`, `minimatch` via ESLint/typescript-eslint). `npm audit --omit=dev` reports 0. | Not shipped to production | Re-check on dependency updates; do not use `--force` |
| 4 | ESLint pinned to 9.39.5 (eslint-config-next 16.4.5 peer range); ESLint 10 not tried | None now | Revisit when config-next supports it |
| 5 | CSP uses `'unsafe-inline'` for scripts/styles | Weaker XSS defence | Nonce-based CSP in Phase 12 |
| 6 | Auth has no UI, cookie code, or CSRF layer | Services only | Phase 3 |
| 7 | Gmail SMTP mailer never tested against real Gmail (no credentials or SMTP egress here) | Verification emails unproven until deployed | After deploy, register a test account and confirm the email arrives |
| 8 | Paystack account not yet live (registration needs the website); first network is MTN MoMo; Hubtel not evaluated | Test mode only | Owner completes registration with the deployed URL |
| 9 | Still open: LLM provider for Kaitlyn, marketplace payout schedule/minimums, registered business name and address | Blocks later phases | See ARCHITECTURE.md |
| 10 | Fonts are self-hosted via `@fontsource-variable/inter` because Google Fonts is unreachable at build here | None (better for privacy) | - |
| 11 | User hard-deletion is blocked once audit rows exist (by design) | Need anonymise flow for erasure requests | Design in Phase 12 |
| 12 | Not deployed: no Heroku credentials here | Site is not live | Owner follows docs/DEPLOYMENT.md |
| 13 | Policy text (terms, privacy, refunds) is a plain-language draft with default terms I chose (24h cancellation notice); not lawyer-reviewed | Legal exposure if wrong | Owner confirms/edits; get a lawyer to review; check Data Protection Commission registration |
| 14 | Phone/WhatsApp number comes from the legacy site and is unconfirmed | Wrong contact on live site | Owner confirms |
| 15 | Marketplace commission 30% is my reading of "average" (Gumroad 10% direct / 30% Discover, Udemy 63% organic) | Affects creator payouts later | Owner confirms before Phase 8 |
| 16 | Heroku Postgres requires disabling TLS certificate verification (encrypted but unverified) | Weaker than verified TLS | Revisit if moving to a provider with verifiable certificates |
| 17 | No page can create accounts yet; the contact flow is mailto/WhatsApp links only | No lead capture in the app | Phase 3 |
