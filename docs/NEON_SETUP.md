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

## 6. Create the photo store

In Vercel, open **Storage**, create a **Blob** store with public access, and connect it to this project. That adds `BLOB_READ_WRITE_TOKEN` for you. To use photos locally, copy the token into `.env.local`.

Without a token the app still works, and people see a message that photos aren't available.

## 7. Add the variables to Vercel

Import the GitHub repo as a Vercel project. Then under **Settings**, **Environment Variables**, add each value to the scope shown, so Preview deployments can never reach production data.

| Variable | Production scope | Preview and Development scope |
| --- | --- | --- |
| `DATABASE_URL` | production branch, pooled | dev branch, pooled |
| `DATABASE_URL_UNPOOLED` | production branch, direct | dev branch, direct |
| `APP_SECRET` | its own new value | a different new value |

Then redeploy so the variables take effect.

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
