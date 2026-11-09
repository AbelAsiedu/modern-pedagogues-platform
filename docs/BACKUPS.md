# Backups: how the TMP database is protected, and how to get it back

Everything that matters lives in one PostgreSQL database on Heroku: accounts, orders, tutor profiles, the text you edit,
and every picture and PDF you upload. The website's code is safe in GitHub; **the database is the only thing that cannot
be rebuilt**. This page says what is protected, what you must do yourself, and how to restore.

## What Heroku does for you, and what it does not (Essential-0 plan)

From Heroku's PGBackups documentation (checked 9 Nov 2026):

| | Essential plans |
|---|---|
| Scheduled backups kept | 7 daily, 1 weekly, no monthly |
| Manual backups kept | 5 (the oldest is deleted to make room) |
| Rollback to a point in time | **No** (not offered on Essential) |
| Failed scheduled backups | **No notice is sent**: you have to look |

So Heroku holds at most about two weeks of history, in the same account as the database. If someone gets into your Heroku
account, or the account is closed for a billing problem, the backups can go with it. That is why the steps below include a
**copy on your own computer**.

## Step 1: switch on daily backups (once)

Heroku does not schedule backups by itself. Run this once (the quotes matter on Windows):

```
heroku pg:backups:schedule DATABASE_URL --at "02:00 Africa/Accra" -a themodernpedagogues
```

Check it took effect:

```
heroku pg:backups:schedules -a themodernpedagogues
```

It should list a daily 02:00 schedule for `DATABASE_URL`. If Heroku refuses the command on your plan, tell me what it
printed, and do Step 2 daily until we find another route.

## Step 2: keep a copy on your computer (every week, and before risky changes)

From the project folder:

```
bash scripts/backup-download.sh
```

It asks Heroku for a fresh backup, downloads it into a `backups/` folder, checks that the file is a readable PostgreSQL
backup (when `pg_restore` is installed), and keeps the newest 12 copies. It stops with an error rather than saving a
broken file.

Rules for those files:

- They contain every learner's and parent's personal details. **Keep them private**: do not email them, upload them to a
  public place, or share the folder. Prefer an encrypted drive or a password-protected archive.
- The folder is ignored by git, so they cannot be committed by accident. Keep it that way.
- Run it **before** any deploy that adds a database change, and before mass edits.

## Step 3: check every week (two minutes)

```
heroku pg:backups -a themodernpedagogues
```

You should see completed backups from the last few days. A scheduled backup that failed leaves no email, so an old or
missing entry is the only warning you will get. If the newest scheduled backup is more than two days old, run Step 2 and
tell me.

## Restoring

**First, practise on your own computer**, so you know it works before you need it. This needs PostgreSQL installed locally:

```
createdb tmp_restore_check
pg_restore --no-owner --no-acl -d tmp_restore_check backups/tmp-2026-11-09_021500.dump
psql -d tmp_restore_check -c "select count(*) from users;"
dropdb tmp_restore_check
```

The count should match the number of accounts you expect. Do this once now and again every few months.

**Restoring on Heroku** replaces the live data completely, so only do it on purpose:

```
heroku maintenance:on -a themodernpedagogues
heroku pg:backups -a themodernpedagogues                 # find the backup id, for example b101
heroku pg:backups:restore b101 DATABASE_URL -a themodernpedagogues
heroku maintenance:off -a themodernpedagogues
```

Everything saved after that backup is lost, including orders and sign-ups. Check the site afterwards and tell anyone whose
recent order or registration is missing.

If Heroku's own backups are gone and only your computer copy is left, do not improvise: ask me, and we will restore the file
into a new, empty database.

## What a backup does not contain

- **Settings.** The Heroku config values (`APP_URL`, the email password, API keys and the two-step sign-in key) are not in
  the database. Keep a private note of which settings exist. Do not store the secrets themselves in email or chat.
- **`MFA_ENCRYPTION_KEY` specifically.** Without it, a restored database cannot read anyone's authenticator seed. Staff
  would sign in with recovery codes and set up their app again. Keep this one key somewhere safe (a password manager).
- **Code.** That is in GitHub. Keep the repository private.

## Not yet in place

- No automatic off-Heroku copy: Step 2 is manual. A scheduled job that uploads encrypted copies to separate storage is the
  proper fix once there is a storage account to use.
- The restore of a computer copy into Heroku has not been rehearsed against the live app.
- Pictures and PDFs sit in the same database, so the 1 GB limit also limits how big a backup can be.
