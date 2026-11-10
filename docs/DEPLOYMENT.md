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
  APP_URL=https://THE-WEB-URL-HEROKU-PRINTED \
  DATABASE_SSL=true DATABASE_SSL_REJECT_UNAUTHORIZED=false \
  EMAIL_PROVIDER=smtp EMAIL_FROM="The Modern Pedagogues <abelasiedu@gmail.com>" \
  SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_SECURE=true \
  SMTP_USER=abelasiedu@gmail.com SMTP_PASSWORD="your-16-char-app-password"

git push heroku main        # builds, then the release phase runs migrations + seed
heroku open -a YOUR-APP-NAME
```

Email is sent through the Gmail account abelasiedu@gmail.com (its App Password goes in `SMTP_PASSWORD`; the account needs 2-Step Verification on). Gmail shows that address as the sender unless you add themodernpedagogues@gmail.com as a "Send mail as" alias in Gmail settings, so `EMAIL_FROM` uses the same address. The public contact address on the website is still themodernpedagogues@gmail.com, and new tutor applications are announced to that inbox.

**`APP_URL` must be the exact address Heroku gave you, not a guess.** Heroku adds a random ending to new apps, so the address looks like `https://themodernpedagogues-70f4f230adc2.herokuapp.com`, not `https://themodernpedagogues.herokuapp.com`. After `heroku create`, run `heroku apps:info -a YOUR-APP-NAME` and copy the **Web URL** (or `heroku domains -a YOUR-APP-NAME`). If you add a custom domain later, switch `APP_URL` to it. Every link in an email (confirm your email, reset your password, order notices) is built from `APP_URL`; if it is wrong, people click the link and Heroku shows "There's nothing here, yet." The admin dashboard shows a warning, with the exact command to run, when `APP_URL` does not match the address you are using.

**Set `APP_URL` before the first push.** Page metadata (canonical and social URLs) is fixed at build time. If you change `APP_URL` later, redeploy.

Create the first administrator (prints a one-hour link to set the password):

```bash
heroku run -a YOUR-APP-NAME npm run admin:create -- themodernpedagogues@gmail.com "Your Name"
```

## Turn on Kaitlyn (optional)

Kaitlyn is off until a key is set: the chat button does not appear and nothing is sent anywhere. To enable her, create a Gemini API key in Google AI Studio (or an OpenRouter or Mistral key), then:

```bash
heroku config:set -a YOUR-APP-NAME GEMINI_API_KEY=your-key
# optional: ASSISTANT_DAILY_LIMIT=1000 (max replies per day, all visitors), GEMINI_MODEL=..., OPENROUTER_API_KEY=..., MISTRAL_API_KEY=...
```

On Windows it is easier to add the key in the Heroku dashboard (your app, Settings, Reveal Config Vars, add `GEMINI_API_KEY`). The app restarts by itself. Then open **Admin > Kaitlyn** and press **Test the connection**: it sends one tiny message and reports in plain words whether the key works, the model name is wrong, or the free quota is used up.

Providers are tried in the order Gemini, OpenRouter, Mistral. Check that provider's free-tier terms and data-use policy before enabling: visitors' questions are sent to it. In the admin, open **Kaitlyn** to see the status, add notes she should know, and switch her off instantly if needed. Update your live privacy policy (Admin > Site text > Policies) with the Kaitlyn paragraph from the default text. Schedule the daily clean-up so chats are deleted after 90 days:

```bash
heroku addons:create scheduler:standard -a YOUR-APP-NAME
# in the Scheduler dashboard add a daily job:  npm run assistant:purge
```

## Turn on Paystack payments (shop orders)

Without a key the shop works by hand: the buyer pays the MoMo number and you mark the order paid. With a key, buyers get a **Pay now** button that opens Paystack (Mobile Money or card), and the order is confirmed by itself.

1. In the Paystack dashboard, open **Settings > API Keys & Webhooks**. Use the **Test** keys first. Copy the **Secret key** (`sk_test_...`), not the public one.
2. Set it on Heroku. On Windows use the dashboard (your app, Settings, Reveal Config Vars, add `PAYSTACK_SECRET_KEY`), or `heroku config:set -a themodernpedagogues PAYSTACK_SECRET_KEY=sk_test_...`. Never paste it into the repository or into a chat. The app restarts by itself and refuses to start if the value does not look like a secret key.
3. In the same Paystack page set the **Webhook URL** to your site address plus `/api/paystack/webhook` (Admin > Orders shows the exact address once the key is set). Test and Live each have their own webhook field.
4. Place a test order as a customer, press **Pay now** and use Paystack's test payment details. The order should become **Paid** and the download should unlock. Admin > Orders shows "paid online" with the Paystack reference.
5. When Paystack has approved your business and given you live keys, replace the config var with the **live** secret key (`sk_live_...`) and set the webhook in the **Live** tab. Admin > Orders then says "Paystack is on (live: real money)".

If a buyer says they paid but the order still waits: find the payment in the Paystack dashboard by the order's TMP- code. Ask the buyer to refresh My orders (the webhook may be late), or mark the order paid by hand with the Paystack reference. KNOWN_ISSUES 54 lists what is and is not built.

## Turn on two-step sign-in (before real money moves)

Two-step sign-in asks for a 6-digit code from an app on the person's phone as well as the password. It is built in and free, but it stays off until the site has a key to protect the codes' secrets. **This release adds a database table (migration 0011), which the release command applies by itself.**

1. Make a key (any computer with Node installed; this prints one line of random text):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

2. Store it on Heroku. On Windows use the dashboard (your app, Settings, Reveal Config Vars, add `MFA_ENCRYPTION_KEY`), or run `heroku config:set MFA_ENCRYPTION_KEY=PASTE_IT_HERE -a themodernpedagogues`. The app restarts by itself.
3. **Keep a copy of that key in a password manager.** If it is lost, nobody's authenticator app works any more (recovery codes still do) and everyone has to set up again.
4. Sign in as the super administrator. Because staff must use two-step sign-in, you are sent to **Account > Two-step sign-in**. Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy), press **Start setup**, scan the picture, type the 6-digit code, and **save the 10 recovery codes** somewhere safe (printed, or in a password manager). Your admin access switches on immediately.
5. Every other staff member does the same the first time they sign in. Until then their staff access stays off.

Good to know:

- The admin dashboard shows a yellow notice with the exact commands while the key is missing.
- A staff member who loses their phone signs in with a recovery code and sets up again. If they have lost the recovery codes too, reset them from the server: open a Heroku shell and run the reset (on Windows, run commands from a shell rather than passing arguments through `heroku run`):

  ```bash
  heroku run bash -a themodernpedagogues
  npm run admin:reset-mfa -- person@example.com
  ```

  This switches off two-step sign-in for that person only, ends their sessions and is written to the audit log. They sign in with their password and set it up again.
- **Emergency only**: if you are locked out and cannot reach the shell, set `STAFF_MFA_REQUIRED=false` to stop requiring it, sign in, and remove that setting (`heroku config:unset STAFF_MFA_REQUIRED`) once fixed. The dashboard warns while it is off.
- Customers (parents and students) can switch it on too, from the same page. It is optional for them.

## Backups

Heroku does not take database backups until you ask it to, and on the Essential plan it keeps very few and tells you nothing when one fails. Switch on the daily schedule once and copy the database to your own computer every week. The full steps, the restore practice run and the limits are in [`BACKUPS.md`](BACKUPS.md); the two commands you need first are:

```bash
heroku pg:backups:schedule DATABASE_URL --at "02:00 Africa/Accra" -a themodernpedagogues
bash scripts/backup-download.sh
```

## If the release fails

`heroku releases` shows `release command failed`; `heroku releases:output` (or `heroku releases:output v6`) prints why. The site stays on the previous version until a release succeeds. On Windows, run server commands from a Heroku shell (`heroku run bash`) rather than passing arguments through `heroku run`, and set values containing `<` or `>` (such as `EMAIL_FROM`) in the dashboard's Config Vars, because Windows treats those characters as redirection.

## What the platform does for you

- `Procfile`: `web: npm start`; `release: npm run db:migrate && npm run db:seed`. Migrations are forward-only and seed is idempotent, so every deploy is safe to repeat. A failing migration aborts the release and the previous version keeps running.
- The server **refuses to start** in production if the configuration is unsafe (non-https `APP_URL`, console mailer, missing SMTP settings). It crashes with the reason in `heroku logs --tail`.
- `GET /api/health` returns `{"status":"ok"}` after a database check, or 503.
- `DATABASE_SSL_REJECT_UNAUTHORIZED=false` is needed because Heroku Postgres uses a certificate chain Node cannot verify. It is the only place certificate verification is turned off; the connection is still encrypted.

## Custom domain (optional, later)

The Web URL Heroku printed (for example `https://themodernpedagogues-70f4f230adc2.herokuapp.com`) is a real HTTPS site and can be used for Paystack registration. A custom domain looks more established: buy one, `heroku domains:add`, point DNS at the target Heroku gives you, then update `APP_URL` and redeploy.

## Before you give Paystack the URL

Read every page once. These need **your** confirmation because they are business decisions or facts I could not verify:

- Contact email. The phone / WhatsApp / MTN MoMo number (+233 59 366 0708) was confirmed by you as the MoMo number; the Contact and Pricing pages show it with that label.
- Refund and cancellation terms (24 hours' notice; refund of undelivered prepaid sessions). These are sensible defaults, not your agreed policy.
- Terms and privacy text: plain-language drafts for this business, **not reviewed by a lawyer**. Also check whether your business must register with Ghana's Data Protection Commission.
- No postal address is shown, by your decision. The business name on the site is "The Modern Pedagogues".
- **Graphing Studio.** The maths tool at https://frontend-iota-lac-92.vercel.app/ appears as a feature band on the home page, as its own page (`/graphing-studio`), in the menu and in the footer. It opens in a new tab (`rel="noopener noreferrer"`); it is not embedded, so TMP's security rules (no framing of other sites) are unchanged. The address, all wording and the feature list are editable in Admin > Site text > Graphing Studio (the address must be https). Pictures: Admin > Images > Home page > "Graphing Studio picture" (a screenshot; until one is uploaded a drawn graph is shown) and Page banners. The feature descriptions are general wording; edit them to match exactly what the studio does.
- **The Pricing page is live.** It explains that fees depend on curriculum, in-person or online, number of hours and location, and that every learner is assessed before any fee is discussed or negotiated. All of its text is editable in Admin > Site text > Pricing page (the four fee factors and the promises are one item per line, as "Title | Description"). If the owner has already saved his own pricing text, his version is shown instead of the new default. To hide the page again, set `PRICING_PAGE_ENABLED` to `false` in `src/lib/site.ts` and redeploy. The page does not say the assessment is free or give its price; add that in the admin text once the owner decides.
- The pricing page says Paystack payment "is being set up" and tells clients to pay the MoMo number after confirming details on WhatsApp. Update it once Paystack is live.

## Paystack requirements (their Ghana page, checked 4 Nov 2026)

Starter business: government ID, TIN, a personal bank account or Mobile Money number, and contact details, all in the same person's name. Registered business: certificate and forms depending on company type, plus TIN. Their page does not mention a website; you said the form asks for one, so use the Heroku URL.

## Pictures, the shop and orders

- **Media** (admin menu): upload JPEG, PNG or WebP pictures (up to 5 MB; they are shrunk to 2000 pixels and location data is removed). They are stored in your Postgres database, so they survive Heroku restarts. Pick them in **Home slideshow**, on a **tutor** (Photo) and on a **resource** (Cover picture). To change a picture everywhere it is used, open **Edit** on it in the Media library and choose **Replace picture**.
- **Site images** (admin menu): every picture on the public pages is placed here: the logo, the browser-tab icon, the picture shown when the site is shared on WhatsApp or social media, Kaitlyn's picture, a picture for each of the six service cards, the About page story picture, the pictures beside "Building a Brighter Future", "Our Impact", the testimonials and the closing banner, and one banner picture for each of Services, Tutors, Resources, Pricing, About and Contact. For each place, press **Add a picture**, choose a file (JPEG, PNG or WebP, up to 5 MB) and add a short description, or pick one already in the Media library. Until you add one, a tidy blue illustration is shown. Page banner pictures (and the home slideshow pictures) fill the whole top banner behind a light blue layer, so use wide landscape pictures about 1600 x 700 with the subject away from the left, where the headline sits. Other pictures about 1400 x 900; the logo a transparent PNG about 400 x 120 that looks good on dark blue. The first (slideshow) banner pictures are under **Home slideshow**, tutor photos are on each tutor, and resource covers on each resource.
- **Social links** are under **Site text > Business details** (Facebook, Instagram, X, YouTube, LinkedIn, TikTok; full https:// links). Leave one empty to hide its icon.
- **Site text** (admin menu) now also holds **Business details** (name, motto, email, phone/WhatsApp, MoMo network and number), **Menu and buttons**, **Page titles and search descriptions**, and the new home-page sections (figures, how it works, curricula strip, testimonials, closing banner, slideshow seconds). Changing the MoMo number changes what buyers see immediately. There are no new migrations or environment variables in this stage; deploy with `git pull origin main` then `git push heroku main`.
- **Resources page filters:** visitors can search and filter by **Subject** (a full list of school subjects, with the ones that already have resources shown first, plus quick links above the results for those), type, level and price. Subjects come from the Subject field on each resource, which now suggests the usual school subjects, so use the same spelling for the same subject.
- **Resources** (admin menu): TMP's own free or paid resources. Add one in a single step: fill in the details (title, type, subject, levels, summary, outcomes, price in cedis or tick "free"), choose the PDF (up to 15 MB) and leave **Publish now** ticked, and it appears on the Resources page straight away. If the PDF is refused, nothing is saved. Each resource has **Show on Resources page** / **Hide** buttons, and a hidden one says why (for example "it has no PDF yet"). **Edit** still changes the details or replaces the PDF. Free resources can be downloaded by any visitor who has signed in. These need no review.
- **Review** (admin menu): resources submitted by other creators. Open one, download and read the PDF, score each criterion 0 to 4, then approve, ask for changes (written feedback needed) or decline. To approve, every criterion must be at least 3 and the average at least 3.25. You can also take down an approved resource (with a reason) and restore it. Everyone who can review: admin, super admin and content manager.
- **Creators** (admin menu; finance and admin): each creator's earnings, what has been paid and what is owed. Pay the creator's MoMo number yourself, then press **Record payout** with the amount and the MoMo transaction ID. You can also suspend a creator.
- **Who can sell**: any signed-in visitor, via **Share your own resource** on the Resources page (or My account). The Creator terms they accept are under **Site text > Terms, privacy and refunds**; the quality standard page intro is under **Site text > Resources**. Review the Creator terms (draft payout minimum GH₵ 50 and 14 days are placeholders) with a lawyer before telling people to join.
- Resources page: `/resources`. Old `/shop` links redirect there.
- **Orders** (admin menu): a buyer signs in, presses Order, and sees a reference like TMP-7K2Q9X and the MoMo steps (editable under Site text > Resources). When the MoMo payment arrives, find the order by that reference, type the MoMo transaction ID, and press **Mark as paid**. The buyer is emailed and the download unlocks under **My orders**. There is no automatic check yet, so look at the actual MoMo message before confirming.
- Database size: pictures and PDFs live in the Essential-0 database (1 GB). Check `heroku pg:info` now and then.

## Troubleshooting: the link in an email shows "There's nothing here, yet."
The link was built from a wrong `APP_URL`. Run `heroku config:set APP_URL=https://<the address you really use> -a themodernpedagogues` (Heroku restarts the app by itself), then ask the person to open **Sign in > Send it again** (`/resend-verification`) for a fresh confirmation link, or use **Forgot your password?** for a reset link. Old links keep pointing at the wrong place and cannot be repaired.
