# Security: what is actually implemented (end of Phase 2)

This lists behaviour that exists in code and is covered by tests. Anything not listed is not done.

## Authentication
- Passwords: Argon2id (19 MiB, 2 iterations, 1 lane), 12-128 characters, no composition rules. Unknown users are verified against a dummy hash so timing does not reveal whether an account exists.
- Sessions: 256-bit random token in an HttpOnly cookie; only its SHA-256 hash is stored. 7-day idle expiry sliding to a 30-day hard cap. A new session is created on every login. Suspension, role changes and logout take effect on the next request because status and roles are re-read from the database.
- Lockout: 5 consecutive failures lock the account for 15 minutes. Per-IP and per-email rate limits (PostgreSQL-backed, atomic) apply to login, sign-up, resend and reset.
- Account enumeration: sign-up, resend and reset return the same response for known and unknown emails; an existing owner is emailed instead. Login returns one error for unknown user and wrong password. Unverified/suspended status is revealed only after the correct password.
- Email verification and password reset tokens: single use (claimed by one conditional UPDATE, tested under concurrency), expire in 24 h / 1 h, stored hashed. Reset revokes all sessions.
- Self-registration can only create `student` or `parent` accounts.

## Authorization
- Permission-based, defined in `src/server/permissions/catalog.ts`. Suspended or unverified accounts hold no permissions.
- `admin` has no finance, settings or privileged-role permissions. Only `super_admin` may grant `super_admin`, `admin` or `finance_manager`; nobody may change their own roles.

## Data
- Money is `bigint` pesewas with an explicit currency; no floating point (unit-tested, including split reconciliation).
- `audit_logs` is append-only: database triggers reject UPDATE, DELETE and TRUNCATE; the actor FK is RESTRICT so users with history cannot be hard-deleted.
- Emails are stored lowercase; a CHECK constraint enforces it.
- Logger redacts password/token/cookie/secret fields by key.
- Production config validation refuses non-HTTPS `APP_URL`, the console mailer and incomplete SMTP settings. It runs at server start and the process exits with code 1 (tested locally).
- Database TLS certificate verification is on by default and can be turned off only through an explicit variable (needed on Heroku).

## Web layer
- Session cookie: `__Host-tmp_session` in production (Secure, HttpOnly, SameSite=Lax, Path=/, no Domain). Checked in a real browser against the production build.
- Forms are Next.js Server Actions, which check that the request's Origin matches the site (CSRF defence). Every action re-reads the user from the database and checks the permission itself; hiding a button is never the only control.
- Admin pages: signed-out visitors go to sign-in; signed-in users without permission get a 404.
- Post-login redirect only accepts same-site relative paths (tested).
- Client IP for rate limiting is the LAST X-Forwarded-For entry, because Heroku's router appends the real address at the end.
- Banner images must be paths on this site and banner links must be same-site, https, mailto or tel (no javascript: or data: URLs); tested.
- Staff safeguards (tested): no suspending yourself; only a super administrator may suspend or change privileged staff; the last super administrator cannot be removed; suspension ends sessions immediately; every admin action is written to the audit log.

## Not yet done (see KNOWN_ISSUES)
Staff MFA, security headers beyond the static set in `next.config.ts` (CSP still allows `'unsafe-inline'`), malware scanning, backups, and an external security review.
