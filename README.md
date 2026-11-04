# The Modern Pedagogues Platform

Commercial education platform for **The Modern Pedagogues (TMP)**: tutoring operations, learning management, structured programmes, an educational marketplace, e-commerce and Ghana Mobile Money payments.

*Education keeps changing. So do we. — Empowering Lives, Changing Destinies.*

This is a new, independent codebase. The legacy site (`AbelAsiedu/home-tutoring-site`) was used only as a read-only business and functional reference and has not been modified.

## Status

**Phase 1 (research and architecture): complete. No application code exists yet.**

| Item | State |
|---|---|
| Legacy repository audit | Done, see [docs/TECHNICAL_AUDIT.md](docs/TECHNICAL_AUDIT.md) |
| Target architecture and decisions | Proposed, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Application foundation (Phase 2) | **Not started** |
| Remote GitHub repository | **Not created**; see below |

Two things stopped Phase 2 in the session that produced this commit, and both are outside the code:

1. **GitHub**: the session's GitHub token was invalid and sessions were limited to attached repositories, so the remote could neither be checked nor created.
2. **Package registry**: `registry.npmjs.org` was blocked by the session's egress policy (HTTP 403 on CONNECT), so no dependency could be installed. Writing a large codebase that cannot be installed, type-checked, tested or built would produce unverified code, which the project requirements prohibit. No code was written rather than code presented as working.

## Create the remote (run on a machine with `gh` authenticated as `AbelAsiedu`)

Check first. If the repository already exists, stop and do not push.

```bash
gh repo view AbelAsiedu/modern-pedagogues-platform && echo "ALREADY EXISTS - stop" || echo "free to create"
```

Create the private repository and push this history:

```bash
cd modern-pedagogues-platform
gh repo create AbelAsiedu/modern-pedagogues-platform --private --source=. --remote=origin --push
```

Equivalent without `gh`: create an empty private repository named `modern-pedagogues-platform` in the GitHub UI (no README, no .gitignore, no licence), then:

```bash
git remote add origin https://github.com/AbelAsiedu/modern-pedagogues-platform.git
git push -u origin main
```

Nothing in this repository pushes to, or depends on, `home-tutoring-site`.

## Decisions recorded

Paystack is the first payment provider (account exists; live verification unconfirmed). Tutoring rates are negotiable per learner, starting from GHS 100 per session. The Kaitlyn AI assistant is kept as an optional later module. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Next step

Continue with Phase 2 (foundation) in an environment where `npm install` works and the GitHub remote exists. The build order, versions to verify at install, and open owner decisions are listed in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
