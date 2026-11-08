# Santa's Sealed Envelopes

A family Christmas gift exchange with no accounts. Everyone submits a locked wishlist, a blind and verifiable draw makes one single gift chain, and each person opens their own wax-sealed envelope. On Christmas Night the chain is revealed link by link on the TV.

Built with Next.js 16, TypeScript, Tailwind 4, Neon Postgres, Drizzle, and Vercel Blob. To deploy it, follow [docs/NEON_SETUP.md](docs/NEON_SETUP.md).

## How it works

| Who | What they do |
| --- | --- |
| **Organizer** | Creates the exchange, saves the Organizer Code, shares the link, locks the pool, sets rules, runs the draw. Never sees who got whom. |
| **Family member** | Opens the link on a phone, enters first and last name, adds wishes, confirms, saves their Elf Code. Later picks their name, enters the code, and breaks the seal. |
| **Everyone, Christmas Night** | Watches the Gift Chain on a TV while the organizer presses Next. After it finishes, the seal can be opened so anyone can verify the draw. |

An exchange moves through `open` (joining), `locked` (rules, then draw), and `drawn` (envelopes available). Gift Chain and the seal unlock at the Christmas Night time, which freezes at the draw.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Create an exchange, or paste a link to an existing one |
| `/x/[slug]` | The Pool: Family groups, live draw warning, countdown, seal fingerprint, public log |
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
| `participants` | `first_name`, `last_name`, normalized `last_name_key` (the family), full-name duplicate key, Elf Code hash |
| `wishlist_items` | Item name, price in centavos, link, photo URL |
| `exclusions` | Extra pairs who can't draw each other, on top of the automatic family rule |
| `assignments` | One row per giver, with recipient and position encrypted |
| `audit_log` | The public history |
| `rate_limits` | Attempt counters, because serverless memory doesn't persist |

Database triggers reject any update or delete on `wishlist_items` and `audit_log`, and any rename or removal of a participant.

## The draw

Three rules always apply: nobody draws themselves, people with the same normalized last name never draw each other, and any extra pairs the organizer adds are respected. Normalizing covers case, accents, and spacing, so "Dela Cruz", "dela  cruz", and "DÉLA CRUZ" are one family. Different spellings such as "De la Cruz" count as separate families, so use an extra rule for those.

[src/lib/draw.ts](src/lib/draw.ts) works in stages, all using `node:crypto` randomness:

1. **Feasibility.** If one family is more than half the pool, no loop can keep them apart, so the draw is blocked with a message naming the family. A family of exactly half works, by alternating around the loop. An exact search then catches impossible combinations of manual rules.
2. **Random cycles.** Sattolo's algorithm makes one single loop with every possible loop equally likely. Whole loops that break a rule are thrown away and retried, up to 20,000 times, which keeps the result uniform among all valid loops.
3. **Randomized backtracking.** If the rules are so tight that retries run out, a search over securely shuffled choices still finds a loop. This is random but not perfectly uniform, so it runs only when needed.

The same check runs live on the lobby. The pool can't be locked while one family is over half, because locking would stop the only fix, which is more people joining.

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
- **Elf Codes are 6 digits, chosen because they're easy to type.** That is far fewer combinations than words, so guessing is limited to 6 tries per person per hour. Someone guessing nonstop from now until Christmas would still have only about a 1 in 150 chance of hitting a given person's code.
- **Wrong guesses can lock someone out for an hour.** The limit is per person, so a relative guessing at someone's code can temporarily block them. A new code from the organizer clears it.

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
