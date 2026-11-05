# Testing

- `npm run test:unit` - pure logic (money, permissions, tokens, passwords, validation, env, errors, logger redaction). No database.
- `npm run test:integration` - real PostgreSQL, no mocks. Global setup drops and recreates the `public` schema of `TEST_DATABASE_URL` (the database name must end in `_test`) and applies every migration, so each run also proves migrations work from empty. Covers auth flows, sessions, rate limiter atomicity, audit immutability, constraints and seed idempotency.
- Test-only: the harness disables the audit triggers inside a transaction to wipe tables between tests; a test proves they are re-enabled.
- Not covered yet: browser/E2E tests (no pages exist), payment webhooks, file uploads.

Latest: 147 tests (unit + integration) pass; lint, typecheck and production build pass. A manual browser run (Playwright against the production build) covered: password-set link, wrong/right password, cookie flags, admin dashboard, adding banners, unsafe link rejected, slideshow controls/autoplay/pause/reduced-motion, mobile layout, sign-out, registration. That script is not in the repo, so it is not an automated regression test yet. Also checked by hand: the built app started with production variables served all 8 pages, sitemap, robots and `/api/health` (200), and exited with code 1 on unsafe configuration. Not covered by automated tests: page rendering and content.
