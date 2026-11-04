# Known issues and open items

| # | Item | Impact | Next action |
|---|---|---|---|
| 1 | GitHub remote not created; session token invalid | Repo exists only as local git history/bundle | Owner runs the commands in README |
| 2 | Playwright browsers likely cannot be downloaded in the build environment | No E2E tests yet | Revisit when pages exist; may need CI |
| 3 | `npm audit`: 12 moderate advisories, all dev-tooling (old `esbuild` inside `drizzle-kit`, `minimatch` via ESLint/typescript-eslint). `npm audit --omit=dev` reports 0. | Not shipped to production | Re-check on dependency updates; do not use `--force` |
| 4 | ESLint pinned to 9.39.5 (eslint-config-next 16.4.5 peer range); ESLint 10 not tried | None now | Revisit when config-next supports it |
| 5 | CSP uses `'unsafe-inline'` for scripts/styles | Weaker XSS defence | Nonce-based CSP in Phase 12 |
| 6 | Auth has no UI, cookie code, or CSRF layer | Services only | Phase 3 |
| 7 | Email is console-only | No real mail | Owner picks provider |
| 8 | Paystack live status and MoMo networks unconfirmed; Hubtel not evaluated | Test mode only | Owner confirms |
| 9 | Open owner decisions: hosting/budget, LLM provider, marketplace commission/payout terms, legal text, contact details | Blocks later phases | See ARCHITECTURE.md |
| 10 | Fonts are self-hosted via `@fontsource-variable/inter` because Google Fonts is unreachable at build here | None (better for privacy) | - |
| 11 | User hard-deletion is blocked once audit rows exist (by design) | Need anonymise flow for erasure requests | Design in Phase 12 |
