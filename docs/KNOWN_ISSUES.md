# Known issues and open items

| # | Item | Impact | Next action |
|---|---|---|---|
| 1 | The GitHub repository is currently public | Source code is visible to anyone | Owner sets it to private (Settings > General > Danger zone) |
| 2 | Playwright browsers likely cannot be downloaded in the build environment | No E2E tests yet | Revisit when pages exist; may need CI |
| 3 | `npm audit`: 12 moderate advisories, all dev-tooling (old `esbuild` inside `drizzle-kit`, `minimatch` via ESLint/typescript-eslint). `npm audit --omit=dev` reports 0. | Not shipped to production | Re-check on dependency updates; do not use `--force` |
| 4 | ESLint pinned to 9.39.5 (eslint-config-next 16.4.5 peer range); ESLint 10 not tried | None now | Revisit when config-next supports it |
| 5 | CSP uses `'unsafe-inline'` for scripts/styles | Weaker XSS defence | Nonce-based CSP in Phase 12 |
| 6 | Account area is minimal: a name, roles and change-password. No parent/student/tutor dashboards | Portals missing | Later stages |
| 7 | Gmail SMTP mailer never tested against real Gmail (no credentials or SMTP egress here) | Verification emails unproven until deployed | After deploy, register a test account and confirm the email arrives |
| 8 | Paystack account not yet live (registration needs the website); first network is MTN MoMo; Hubtel not evaluated | Test mode only | Owner completes registration with the deployed URL |
| 9 | Still open: which AI provider and key for Kaitlyn (Gemini is tried first), marketplace payout schedule/minimums, registered business name (no postal address is shown, by owner decision) | Kaitlyn stays off until a key is set; later phases | See ARCHITECTURE.md and DEPLOYMENT.md |
| 10 | Fonts are self-hosted via `@fontsource-variable/inter` because Google Fonts is unreachable at build here | None (better for privacy) | - |
| 11 | User hard-deletion is blocked once audit rows exist (by design) | Need anonymise flow for erasure requests | Design in Phase 12 |
| 12 | Not deployed: no Heroku credentials here | Site is not live | Owner follows docs/DEPLOYMENT.md |
| 13 | Policy text (terms, privacy, refunds) is a plain-language draft with default terms I chose (24h cancellation notice); not lawyer-reviewed | Legal exposure if wrong | Owner confirms/edits; get a lawyer to review; check Data Protection Commission registration |
| 14 | The MoMo / phone / WhatsApp number is one number, confirmed by owner as the MTN MoMo number. The MoMo account name is not shown (unknown to me) | Clients may want to check the name before paying | Owner may add the registered MoMo account name |
| 15 | Marketplace commission 30% is my reading of "average" (Gumroad 10% direct / 30% Discover, Udemy 63% organic) | Affects creator payouts later | Owner confirms before Phase 8 |
| 16 | Heroku Postgres requires disabling TLS certificate verification (encrypted but unverified) | Weaker than verified TLS | Revisit if moving to a provider with verifiable certificates |
| 17 | No page can create accounts yet; the contact flow is mailto/WhatsApp links only | No lead capture in the app | Phase 3 |
| 18 | **Not built yet from the old site:** marketplace (listings, creators, moderation, cart, checkout, downloads), e-store, learning portals, enrol-a-ward, FAQ/curriculum pages. (Tutors and Kaitlyn are now built.) | The site is a subset of the old one | Staged: marketplace next |
| 19 | Banner images can only be files already on the site (`/images/...`). Admins cannot upload images yet | Changing a picture needs a code change | Storage module (private/public buckets) |
| 20 | Browser end-to-end tests are not automated or in the repo | Regressions in forms/slideshow would not be caught automatically | Add Playwright to CI once a CI exists |
| 21 | Dev-server CSP allows `unsafe-eval` (development only); production does not | None in production | - |
| 22 | Kaitlyn has never called a real AI provider: tests and the browser check use a stand-in that returns canned text. The Gemini request format is ported from the legacy code, not verified against Google's live API from here | The first real chat may need a small fix | After setting a key, ask her a few questions and read the answers; check the admin Kaitlyn page |
| 23 | Kaitlyn's block-list was changed from the legacy version: whole words only, and "hate", "abuse", "racist", "sexist", "violence" were dropped because they blocked ordinary questions and genuine safeguarding questions. Self-harm now gets a caring reply. The model is also instructed to refuse harmful requests | Different from the old behaviour | Owner reviews `src/server/assistant/guard.ts` |
| 24 | Kaitlyn sends visitors' questions and TMP's public text to a third-party AI provider, and stores chats for 90 days. The default privacy text now says so; a deployed site that already has an edited privacy policy will not pick this up automatically | Privacy notice could be out of date | Owner adds the Kaitlyn paragraph to the live policy; schedule `npm run assistant:purge` daily |
| 25 | Legacy HuggingFace and "generateContent" Gemini fallbacks were not ported (Gemini Interactions, OpenRouter and Mistral are) | Fewer fallbacks | Add if wanted |
| 26 | Tutor applications are not linked to user accounts, and approving a tutor does not create a login or grant the tutor role. Photos, credentials upload and reference checks are not built. Staff can edit every tutor field (public and private) and delete a record | Tutor portal and verification come later | Next stages |
| 27 | Page titles and descriptions (the browser tab and search snippets) are not editable from the admin; only the visible page text is | Small SEO edits need a code change | Add if wanted |
| 28 | Site text edits are not versioned: resetting restores the built-in default, not the previous edit (the audit log records who changed which fields, not the old text) | Accidental edits cannot be undone from the UI | Add history if wanted |
