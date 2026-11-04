# Deploying to Heroku

Status: **configuration is written and verified locally in production mode; nothing has been deployed.** Deploying needs your Heroku account and billing card, which this build environment does not have.

## What it costs (from Heroku's published pricing, checked 4 Nov 2026)

| Item | Plan | Price |
|---|---|---|
| Web dyno | **Basic** (never sleeps) | up to US$7 / month |
| Database | **Heroku Postgres Essential-0** (1 GB) | US$5 / month |
| **Total** | | **about US$12 / month** |

Cheaper option: an **Eco** dyno is a flat US$5 / month for a shared pool of 1,000 hours, but as far as I know Eco dynos sleep when idle, so the first visit after a quiet period is slow. For a site a payment provider's reviewer will open, Basic is the safer choice. Prices change; confirm on heroku.com/pricing before you add a card.

## One-time prerequisites (you)

1. A Heroku account with a payment method, and the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli).
2. **Gmail App Password** for `themodernpedagogues@gmail.com`: turn on 2-Step Verification in the Google account, then create an App Password (Google Account > Security > App passwords). It is 16 characters. Never use the account password. Gmail limits how many messages an account can send per day, so it suits launch volumes, not bulk mail; check Google's current limit and move to a transactional email provider later.
3. This repository on your machine (restore from the git bundle, or clone once the GitHub remote exists).

## Deploy

```bash
heroku login
heroku create YOUR-APP-NAME --stack heroku-24      # pick a unique name, e.g. themodernpedagogues
heroku addons:create heroku-postgresql:essential-0 -a YOUR-APP-NAME
heroku ps:type web=basic -a YOUR-APP-NAME

heroku config:set -a YOUR-APP-NAME \
  APP_URL=https://YOUR-APP-NAME.herokuapp.com \
  DATABASE_SSL=true DATABASE_SSL_REJECT_UNAUTHORIZED=false \
  EMAIL_PROVIDER=smtp EMAIL_FROM="The Modern Pedagogues <themodernpedagogues@gmail.com>" \
  SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_SECURE=true \
  SMTP_USER=themodernpedagogues@gmail.com SMTP_PASSWORD="your-16-char-app-password"

git push heroku main        # builds, then the release phase runs migrations + seed
heroku open -a YOUR-APP-NAME
```

**Set `APP_URL` before the first push.** Page metadata (canonical and social URLs) is fixed at build time. If you change `APP_URL` later, redeploy.

Create the first administrator (prints a one-hour link to set the password):

```bash
heroku run -a YOUR-APP-NAME npm run admin:create -- themodernpedagogues@gmail.com "Your Name"
```

## What the platform does for you

- `Procfile`: `web: npm start`; `release: npm run db:migrate && npm run db:seed`. Migrations are forward-only and seed is idempotent, so every deploy is safe to repeat. A failing migration aborts the release and the previous version keeps running.
- The server **refuses to start** in production if the configuration is unsafe (non-https `APP_URL`, console mailer, missing SMTP settings). It crashes with the reason in `heroku logs --tail`.
- `GET /api/health` returns `{"status":"ok"}` after a database check, or 503.
- `DATABASE_SSL_REJECT_UNAUTHORIZED=false` is needed because Heroku Postgres uses a certificate chain Node cannot verify. It is the only place certificate verification is turned off; the connection is still encrypted.

## Custom domain (optional, later)

`https://YOUR-APP-NAME.herokuapp.com` is a real HTTPS site and can be used for Paystack registration. A custom domain looks more established: buy one, `heroku domains:add`, point DNS at the target Heroku gives you, then update `APP_URL` and redeploy.

## Before you give Paystack the URL

Read every page once. These need **your** confirmation because they are business decisions or facts I could not verify:

- Contact email. The phone / WhatsApp / MTN MoMo number (+233 59 366 0708) was confirmed by you as the MoMo number; the Contact and Pricing pages show it with that label.
- Refund and cancellation terms (24 hours' notice; refund of undelivered prepaid sessions). These are sensible defaults, not your agreed policy.
- Terms and privacy text: plain-language drafts for this business, **not reviewed by a lawyer**. Also check whether your business must register with Ghana's Data Protection Commission.
- No postal address is shown, by your decision. The business name on the site is "The Modern Pedagogues".
- The pricing page says Paystack payment "is being set up" and tells clients to pay the MoMo number after confirming details on WhatsApp. Update it once Paystack is live.

## Paystack requirements (their Ghana page, checked 4 Nov 2026)

Starter business: government ID, TIN, a personal bank account or Mobile Money number, and contact details, all in the same person's name. Registered business: certificate and forms depending on company type, plus TIN. Their page does not mention a website; you said the form asks for one, so use the Heroku URL.
