# Security: what is actually implemented (end of Phase 2)

This lists behaviour that exists in code and is covered by tests. Anything not listed is not done.

## Authentication
- Passwords: Argon2id (19 MiB, 2 iterations, 1 lane), 12-128 characters, no composition rules. Unknown users are verified against a dummy hash so timing does not reveal whether an account exists.
- Sessions: 256-bit random token in an HttpOnly cookie; only its SHA-256 hash is stored. 7-day idle expiry sliding to a 30-day hard cap. A new session is created on every login. Suspension, role changes and logout take effect on the next request because status and roles are re-read from the database.
- Lockout: 5 consecutive failures lock the account for 15 minutes. Per-IP and per-email rate limits (PostgreSQL-backed, atomic) apply to login, sign-up, resend and reset.
- Account enumeration: sign-up, resend and reset return the same response for known and unknown emails; an existing owner is emailed instead (a fresh confirmation link if the account is still unconfirmed, otherwise a password-reset link). Signing up again on an unconfirmed address never changes its password, so nobody can pre-set the password on someone else's address; the password chosen first stays in force. Login returns one error for unknown user and wrong password. Unverified/suspended status is revealed only after the correct password.
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

## Editable text and tutors
- Admin-written text is parsed into a small typed tree and rendered by React; it can never inject HTML or script. Links are limited to site paths, https, mailto and tel (tested with `javascript:`, `data:`, `//host`, and raw `<script>`).
- Every field is checked against a registry of known keys and its own length limit, by the permission for that field (policies need `content.manage_legal`). A form cannot write a key outside its section. Saves are atomic and audited (which keys, not the text).
- Tutor profiles keep private data (name, email, phone, qualifications, notes) and public data in one row, but the public queries select an explicit column list and a test asserts the public shape has exactly the safe keys. A profile is public only when approved AND published; a database CHECK refuses a published row that is not approved. Email, links and phone-like numbers are rejected in public fields.
- Business details (name, motto, email, phone/WhatsApp, MoMo network and number) are editable but need the **legal-text** permission, because the MoMo number is where buyers send money. Email, phone, MoMo and slideshow seconds are validated on save with plain-words errors, and every change is audited (keys only). Phone numbers are normalised to digits before they become `tel:` and `wa.me` links, so no markup can enter a link.
- `POST /api/admin/products` (add a resource with its PDF) follows the same upload rules: Origin, sign-in and the product permission are checked before the body is read, the size is capped, the PDF goes through the same inspection, and a failed PDF removes the new entry again.
- Site pictures: `?slot=` uploads need the same checks as any upload (Origin, sign-in, site permission, all before the body is read), only accept slots registered as images, and store only re-encoded JPEG/PNG/WebP. `setImageSlot` accepts only a `/media/<id>.<ext>` path that exists in the media library, so a slot cannot point at an outside address. Social links are https-only and shown as ordinary links.
- "Replace picture" is staff-only (not creators), re-encodes the new image exactly like an upload, and swaps usages in one transaction; the cached `/media` address of the old picture is never changed in place.
- Applications are rate-limited per IP and per email, and a repeat application from the same email is accepted silently, so the form does not reveal who has applied.

## Kaitlyn (AI assistant)
- Provider keys are read from the server environment only, sent only in a request header to the provider, never to browsers, logs or error messages (tested). Provider errors keep the provider name and status only.
- She answers from public site text, published tutor profiles and admin-written notes. She has no access to accounts, payments, bookings, learner data, or private tutor fields (tested: private strings are absent from the prompt). Her instructions tell her not to invent facts, not to ask for passwords/PINs, and to treat visitor text as data.
- `/api/chat` checks the Origin header (browser requests from other sites are refused), content type and body size, and is rate-limited per visitor (20 per 10 minutes) and per day across all visitors (cost cap). Her replies are rendered through the safe renderer with same-site, mailto and tel links only.
- Chats are logged without IP address or account, and deleted after 90 days by `npm run assistant:purge` (schedule it).
- Limits: prompt injection cannot be fully prevented in any language model. The mitigations are the above (no private data reachable, no actions available, safe rendering), not a guarantee about what she will say.

## Uploads and the shop
- Image uploads are decoded and re-encoded with sharp: only real JPEG, PNG or WebP bytes pass (file name and browser-claimed type are ignored), EXIF/GPS metadata and anything appended to the file are dropped, and the size is capped. SVG, GIF and HTML are refused (tested). `/media/<id>.<ext>` is served with `nosniff` and `Content-Security-Policy: sandbox` so a stored file can never run as a page.
- Both upload routes require a same-origin request and a signed-in user with the right permission BEFORE the body is read, and refuse oversized bodies by Content-Length.
- Product PDFs are private: the public queries select an explicit column list without the file reference, and `/api/downloads/<order>` returns the file only to the buyer of a PAID order or to staff who manage orders (everyone else gets 401/404; tested). Downloads are `attachment`, `no-store`, `nosniff`, sandboxed. A PDF is checked only by its first bytes; it is not scanned for malware.
- Orders copy the title and price when placed, one live order per buyer and product is enforced by the database, a double click returns the same order, and "mark paid" needs a transaction ID, is a conditional update (two staff cannot both win), and is audited. Audit entries hold the order reference, not the buyer's details.

## Creator marketplace
- Anyone with a verified account can become a creator by accepting the Creator terms; that grants only the `creator` role (permission `portal.creator`) through one narrow path that cannot grant any other role.
- A creator can read, change, upload to or delete only their own listings (ownership is checked in the service and the SQL), and use only their own pictures as covers. Staff cannot edit a creator's listing; they can approve, ask for changes, decline, take down or restore it. Nobody reviews their own resource. A review decision applies only to the submission the reviewer saw and a row lock stops two reviewers both deciding (tested, including a race).
- Nothing a creator uploads is public until a reviewer approves it: the database refuses `is_published` unless the listing is APPROVED and has a file. A creator's new PDF goes to a pending slot, so the approved file stays what buyers get until the new one is approved.
- PDFs are checked with pdf-lib before storage (see KNOWN_ISSUES 35). Reviewers download the file under review through a route only they can open. Free files download only for signed-in accounts through `/api/resources/<slug>/download`; paid files only through `/api/downloads/<order>` for a PAID order (or staff), and not at all while the resource is taken down.
- Listing text may not contain emails, links or phone numbers (keeps sales and contact on the platform); the creator signs four declarations (originality/rights, no personal data, accuracy, terms) stored with the date and version.
- Money: the creator and TMP shares are written onto the order in the same transaction that marks it paid; a payout locks the creator row, cannot exceed the balance, needs a transaction ID, and is audited. The payout phone number is shown only to staff with the payouts permission.
- Creators are rate-limited (picture and PDF uploads, joining) and capped (30 listings, 100 MB of PDFs, 40 pictures). Staff can suspend a creator, which blocks new uploads and submissions.

## Not yet done (see KNOWN_ISSUES)
Staff MFA, malware and plagiarism scanning of creator PDFs, security headers beyond the static set in `next.config.ts` (CSP still allows `'unsafe-inline'`), malware scanning, backups, and an external security review.
