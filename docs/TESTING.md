# Testing

- `npm run test:unit` - pure logic (money, permissions, tokens, passwords, validation, env, errors, logger redaction). No database.
- `npm run test:integration` - real PostgreSQL, no mocks. Global setup drops and recreates the `public` schema of `TEST_DATABASE_URL` (the database name must end in `_test`) and applies every migration, so each run also proves migrations work from empty. Covers auth flows, sessions, rate limiter atomicity, audit immutability, constraints and seed idempotency.
- Test-only: the harness disables the audit triggers inside a transaction to wipe tables between tests; a test proves they are re-enabled.
- Not covered yet: browser/E2E tests (no pages exist), payment webhooks, file uploads.

State at end of Phase 2: 98 tests (unit + integration) pass; lint, typecheck and production build pass.
