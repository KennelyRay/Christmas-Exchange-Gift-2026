# Neon and Vercel setup

This takes about 20 minutes. You'll end up with two separate databases: `production` for the real family exchange, and `dev` for everything else.

You need a [Neon](https://neon.com) account, a [Vercel](https://vercel.com) account, this repo on GitHub, and Node 22 or newer. Neon's and Vercel's menus change from time to time, so a label may differ slightly from what's written here.

## 1. Create the Neon project

1. In the Neon Console, create a project. Pick **Singapore** as the region, the closest to the Philippines.
2. The project starts with one default branch, usually named `production` or `main`. This is the real family database.

## 2. Create the dev branch

Do this **before** any real data exists. A normal branch is a copy of its parent, so a branch made later would copy your family's wishlists.

In the Console: **Branches**, then **Create branch**, name it `dev`, and parent it from the default branch.

Or with the CLI:

```bash
npx neonctl auth
npx neonctl branches create --name dev
```

If real data already exists, create it empty instead with `npx neonctl branches create --name dev --schema-only`. Schema-only branches were in beta when this was written, so check `npx neonctl branches create --help` if the flag is rejected.

## 3. Get the connection strings

You need two strings for **each** branch. In the Console, open **Connect** on the project dashboard, select the branch, and use the **Connection pooling** toggle.

| Variable | Connection pooling | Host looks like | Used by |
| --- | --- | --- | --- |
| `DATABASE_URL` | On | `ep-name-123-pooler.region.aws.neon.tech` | The app |
| `DATABASE_URL_UNPOOLED` | Off | `ep-name-123.region.aws.neon.tech` | Migrations only |

With the CLI:

```bash
npx neonctl connection-string dev --pooled
npx neonctl connection-string dev
```

Treat these like passwords.

## 4. Set up your computer

Copy `.env.example` to `.env.local` and fill it in with the **dev** branch's strings:

```bash
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://.../neondb?sslmode=require
APP_SECRET=
```

Generate `APP_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Then install and migrate the dev branch:

```bash
npm install
npm run db:migrate
npm run dev
```

`db:migrate` prints the host it is about to change. Check it's the one you expect.

## 5. Migrate production

Point the command at the production branch's **direct** string for one run. A variable set in the shell wins over `.env.local`.

PowerShell:

```powershell
$env:DATABASE_URL_UNPOOLED='postgresql://...production direct string...'; npm run db:migrate; Remove-Item Env:DATABASE_URL_UNPOOLED
```

macOS, Linux, or Git Bash:

```bash
DATABASE_URL_UNPOOLED='postgresql://...production direct string...' npm run db:migrate
```

## 6. Set up photo storage (Neon Object Storage)

Wishlist photos live in Neon Object Storage, next to the database. It's a beta feature, so check [Neon's storage docs](https://neon.com/docs/storage/overview) if a step below doesn't match what you see.

Storage is **branch-scoped**: each branch has its own bucket contents, endpoint, and credentials. Production must use the production branch's, and Preview and your computer must use the dev branch's, so test photos never mix with the family's.

**a. Check the region.** Object Storage is available in `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, and `aws-ap-southeast-1`. This project is in `aws-ap-southeast-1` (Singapore), so it's supported.

**b. Sign the CLI in.** Run `neon auth`. It opens a browser to log in.

**c. Create the bucket on each branch.** In the Neon Console, open the branch, go to the **Object storage** tab, choose **New bucket**, name it `wishlist-photos`, and pick **Public read** (anonymous reads, signed writes). Do this on `production` and on `dev`. A branch created later inherits its parent's buckets.

With the CLI, for the branch your CLI is pointed at:

```bash
neon buckets create wishlist-photos --access-level public_read
```

**d. Get the credentials for each branch.** On your computer, back up `.env.local` first, then pull the **dev** branch's values:

```bash
neon env pull --file .env.local
```

That writes `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`. Check `APP_SECRET` is still there afterwards. For production, create a credential on the production branch:

```bash
neon credentials create --scope storage:read --scope storage:write --name wishlist-photos-production
```

The secret is shown only once, so copy it straight into Vercel (step 7). A credential works on its own branch and the branches under it, so a dev credential can never touch production photos.

**e. Allow uploads from the app's sites (CORS).** Phones upload straight to storage, so the bucket must accept requests from the app's addresses. With the dev values in `.env.local`:

```bash
npm run photos:setup -- --for=dev
```

That allows `http://localhost:3000` and the Vercel preview addresses. For production, run it with the production branch's values in the shell instead:

```powershell
$env:AWS_ENDPOINT_URL_S3='...'; $env:AWS_ACCESS_KEY_ID='...'; $env:AWS_SECRET_ACCESS_KEY='...'; npm run photos:setup -- --for=production
```

The script prints which storage host it's changing, saves the rules, then tests the bucket end to end. It does a test upload, an anonymous read (proving public read is on), and a browser-style check from each allowed address, then deletes the test file. Every line should say `ok`.

Until these variables are set, the app still works: people see a message that photos aren't available and can save items without one.

**f. Daily cleanup.** `vercel.json` schedules `/api/cron/cleanup-photos` once a day. It deletes photos that were uploaded but never saved with a wishlist, after 48 hours. Set `CRON_SECRET` in Vercel Production (step 7) so only Vercel can call it.

## 7. Add the variables to Vercel

Import the GitHub repo as a Vercel project. Then under **Settings**, **Environment Variables**, add each value to the scope shown, so Preview deployments can never reach production data.

| Variable | Production scope | Preview and Development scope |
| --- | --- | --- |
| `DATABASE_URL` | production branch, pooled | dev branch, pooled |
| `DATABASE_URL_UNPOOLED` | production branch, direct | dev branch, direct |
| `APP_SECRET` | its own new value | a different new value |
| `AWS_ENDPOINT_URL_S3` | production branch storage endpoint | dev branch storage endpoint |
| `AWS_ACCESS_KEY_ID` | production branch credential | dev branch credential |
| `AWS_SECRET_ACCESS_KEY` | production branch credential | dev branch credential |
| `AWS_REGION` | `ap-southeast-1` | `ap-southeast-1` |
| `CRON_SECRET` | any long random value | not needed |

Then redeploy so the variables take effect. The `AWS_*` values come from step 6. They are server-only: never add a `NEXT_PUBLIC_` copy. If an old `BLOB_READ_WRITE_TOKEN` is still set, delete it, since nothing uses it any more.

**Save the production `APP_SECRET` in a password manager.** If it is lost or changed after the draw, nobody can open their envelope and the draw has to be reset.

### Why not the Neon-Vercel integration?

Neon offers an integration that creates a database branch for each preview deployment and sets these variables itself. It's useful for larger teams, but those preview branches are parented from your default branch, so they would copy real family data. For this app, the single `dev` branch above is safer and simpler.

## 8. Check it worked

1. Open the Preview URL, create a test exchange, add three people, lock the pool, and run the draw.
2. In the Neon SQL Editor on the **dev** branch, run:

   ```sql
   SELECT giver_id, sealed_recipient FROM assignments LIMIT 3;
   ```

   `sealed_recipient` should be unreadable ciphertext.
3. On the **production** branch, confirm `SELECT count(*) FROM exchanges;` returns 0. That proves testing stayed away from it.
4. Open the Production URL and create the real exchange.

## Changing the schema later

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate` and review the new file in `drizzle/`.
3. Run `npm run db:migrate` to apply it to dev, and test.
4. Repeat step 5 to apply it to production before deploying the code.

## Resetting the dev branch

Don't use Neon's **Reset from parent** on `dev` once real data exists, because it copies production into dev. Delete the branch and recreate it with `--schema-only`, then update the dev connection strings and run `npm run db:migrate`.

## Troubleshooting

| What you see | What it means |
| --- | --- |
| `DATABASE_URL_UNPOOLED points at a pooled host` | You pasted the pooled string. Turn Connection pooling off and copy it again |
| `APP_SECRET must be set to at least 32 characters` | The variable is missing or short for this environment |
| The first request after a quiet period is slow | Neon's compute is waking up, which takes a moment and is normal |
| An envelope gives a server error after a deploy | `APP_SECRET` was changed since the draw. Restore the original value |
| "Photos aren't available right now" | The `AWS_*` storage variables aren't set for this environment |
| "The photo didn't finish uploading" every time | Usually CORS: run `npm run photos:setup` for that branch and check every line says `ok` |
| `photos:setup` says the bucket doesn't exist | Create `wishlist-photos` on that branch first (step 6c) |
| `photos:setup` fails the anonymous read | The bucket isn't public read. Change its access level in the Console |
| Photos show a gift box instead of the picture | The browser can't load the photo. Check the bucket is public read |
