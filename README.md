# Santa's Sealed Envelopes

A family Christmas gift exchange with no accounts. Everyone submits a locked wishlist, a blind and verifiable draw makes one single gift chain, and each person opens their own wax-sealed envelope. On Christmas Night the chain is revealed link by link on the TV.

Built with Next.js 16, TypeScript, Tailwind 4, Neon Postgres, Drizzle, and Vercel Blob. To deploy it, follow [docs/NEON_SETUP.md](docs/NEON_SETUP.md).

## How it works

| Who | What they do |
| --- | --- |
| **Organizer** | Creates the exchange, saves the Organizer Code, shares the link, locks the pool, sets rules, runs the draw. Never sees who got whom. |
| **Family member** | Opens the link on a phone, adds wishes, confirms, saves their Elf Code. Later picks their name, enters the code, and breaks the seal. |
| **Everyone, Christmas Night** | Watches the Gift Chain on a TV while the organizer presses Next. After it finishes, the seal can be opened so anyone can verify the draw. |

An exchange moves through `open` (joining), `locked` (rules, then draw), and `drawn` (envelopes available). Gift Chain and the seal unlock at the Christmas Night time, which freezes at the draw.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Create an exchange, or paste a link to an existing one |
| `/x/[slug]` | The Pool: who has joined, countdown, seal fingerprint, public log |
| `/x/[slug]/join` | Wishlist form, then the one-time Elf Code |
| `/x/[slug]/envelope` | Private Envelope Mode: envelope or shakeable gift box |
| `/x/[slug]/chain` | Christmas Night Gift Chain for the TV |
| `/x/[slug]/organizer` | Organizer console |
| `/x/[slug]/seal` | Check the draw against the published fingerprint |

## API

All routes live under `/api/exchanges`, validate input with zod, and return errors as `{ error: { code, message, fields? } }`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `POST /` | Anyone | Create an exchange. Returns the Organizer Code once |
| `GET /[slug]` | Anyone | Lobby data |
| `POST /[slug]/participants` | Anyone | Submit a wishlist. Returns the Elf Code once. There is no update or delete route |
| `POST /[slug]/uploads` | Anyone | Upload a compressed wishlist photo |
| `POST /[slug]/envelope` | Elf Code | Open an envelope. Rate limited |
| `GET /[slug]/chain` | Anyone | Links revealed so far, nothing before Christmas Night |
| `POST /[slug]/chain` | Organizer | Reveal the next link |
| `GET /[slug]/seal` | Anyone | Fingerprint, plus the full list once opened |
| `POST`, `DELETE /[slug]/organizer` | Anyone | Sign in (rate limited) or out |
| `GET`, `PATCH /[slug]/organizer` | Organizer | Dashboard, or change budget and Christmas Night |
| `POST /[slug]/organizer/pool` | Organizer | Lock or reopen the pool |
| `PUT /[slug]/organizer/exclusions` | Organizer | Replace the rules |
| `POST`, `DELETE /[slug]/organizer/draw` | Organizer | Run the draw, or reset it with a public reason |
| `POST /[slug]/organizer/participants/[id]/code` | Organizer | Issue a new Elf Code |
| `POST /[slug]/organizer/seal` | Organizer | Open the seal |

## Data model

Migrations are in [drizzle/](drizzle/) and the schema is [src/db/schema.ts](src/db/schema.ts).

| Table | Holds |
| --- | --- |
| `exchanges` | Status, organizer code hash, budget hint, Christmas Night, seal fingerprint and sealed manifest |
| `participants` | Name, duplicate-check key, Elf Code hash |
| `wishlist_items` | Item name, price in centavos, link, photo URL |
| `exclusions` | Pairs who can't draw each other |
| `assignments` | One row per giver, with recipient and position encrypted |
| `audit_log` | The public history |
| `rate_limits` | Attempt counters, because serverless memory doesn't persist |

Database triggers reject any update or delete on `wishlist_items` and `audit_log`, and any rename or removal of a participant.

## The draw

[src/lib/draw.ts](src/lib/draw.ts) uses Sattolo's algorithm with `node:crypto` randomness, which makes one single loop with no self-picks and gives every possible loop the same chance. With exclusion rules it rejects whole loops until one fits, which keeps the result uniform among valid loops. A separate exact search tells impossible rules apart from unlucky ones, so the organizer gets a clear message.

The draw runs in one Neon transaction holding a row lock on the exchange. It stores the encrypted assignments and publishes `SHA-256(manifest)`, where the manifest is the full list plus a random 256-bit salt.

## What the privacy does and doesn't cover

Protected:

- Elf and Organizer Codes are stored only as bcrypt hashes.
- Assignments are AES-256-GCM encrypted, so browsing Neon shows only ciphertext. Row order doesn't reveal the chain either.
- No organizer screen or API returns assignment data.
- Gift Chain and the seal stay shut for everyone until Christmas Night.

Limits you should know about:

- **A reissued code could be misused.** The organizer sees the new code, and it would open that person's envelope. The event is permanently public and the person's old code stops working, so it can't be done quietly, but it can be done.
- **Whoever holds both database and `APP_SECRET` access can decrypt.** That is whoever deploys this. They would have to write code to do it on purpose, but it isn't impossible.
- **Christmas Night can be moved earlier before the draw.** Every change appears in the public log.
- **The seal proves nothing changed after sealing.** It can't prove the draw was never reset and rerun, which is why resets are logged publicly with a reason.
- **Wrong guesses can lock someone out for 15 minutes.** The limit is per person, so a relative guessing at someone's code can temporarily block them. A new code from the organizer clears it.

## Commands

```bash
npm run dev          # local development, needs .env.local
npm test             # unit and integration tests
npm run typecheck
npm run lint
npm run db:generate  # create a migration after editing the schema
npm run db:migrate   # apply migrations to the branch in DATABASE_URL_UNPOOLED
```

Tests run against PGlite, a real Postgres engine in WebAssembly, so they need no Neon account and can't touch real data.

To click through the app with no Neon account, start it on a throwaway in-memory database. Photo uploads stay off, and data disappears when it stops. Production never loads this code.

```powershell
$env:E2E_PGLITE='1'; $env:APP_SECRET='local-only-secret-at-least-32-characters'; npx next dev
```
