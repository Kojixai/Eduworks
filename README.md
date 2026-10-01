# Learn Works (mylearn.works)

Free online practice that goes with Learn Works books, plus open curriculum content (Oak National Academy, GOV.UK / STA) for Key Stages 1 to 4.
Live at <https://www.mylearn.works>. Next.js 15, SQLite (`better-sqlite3`), Tailwind 4, no build step on the server.

Two layers share one site, one account system and one parent dashboard:

| Layer | What | Access |
|---|---|---|
| **Inkworks books** | 8 books, 379 topics, 3,790 checked questions in 9 types (diagrams, reading texts, worked explanations) | Needs a book code. Unlocks one book for `ACCESS_MONTHS` |
| **Curriculum** | Oak lessons and quizzes, STA papers, phonics check, times tables check | Any signed-in account |

Background: `docs/INKWORKS_MERGE_BRIEF.txt` (the rules the merge keeps), `docs/CONTENT_SCHEMA.txt` (book bank format), `research/platform_research.json` (63 sources), `docs/Merge_Audit.html` (open items, tick-off list).

## Run it

```bash
npm ci
npm run db:build          # builds data/db/eduworks.sqlite from data/jsonl + content/inkworks (about a minute)
npm run dev               # http://localhost:3000
```

Local dev logins (never created in production): admin `admin@example.com` / `admin-demo-2026`, parent `demo@example.com` / `Practice123`. In production there are no demo accounts: log in as the admin and use the **Admin / Parent / Child** switcher in the header to preview each view (an admin with no learners sees a clearly-labelled sample learner, and can open every book).
Demo book codes (`DEMO-Y3MATHS`, `DEMO-Y8MATHS`, `DEMO-KS2READING10`, `DEMO-KS3ENGLISH`, `DEMO-GCSEENGLANG`, `DEMO-Y3READING`, `DEMO-MACBETH`, `DEMO-AIC`) work only when `NODE_ENV` is not `production` or `ALLOW_DEMO_CODES=1`.

## Checks

```bash
npx tsc --noEmit
npx vitest run                              # unit tests (redemption rules, dashboard maths, marking, ingest)
npx tsx scripts/validate-inkworks.ts        # schema-check all 8 books
# browser journeys (start the app first: ALLOW_DEMO_CODES=1 CODE_PEPPER=test npx next start -p 3100)
node scripts/e2e-books.mjs                  # sign up, all 8 books, dashboard, PIN lock, export, delete account
node scripts/e2e-mobile.mjs                 # phone-width pass: overflow and tap targets
```

## Settings (server `.env`)

| Name | Default | Meaning |
|---|---|---|
| `CODE_PEPPER` | none (required in production) | Keys the hashes of access codes, order numbers, IPs and PINs. Generated on the first deploy. **Never change or lose it** or every printed code stops working |
| `ACCESS_MONTHS` | `6` | How long a code unlocks a book |
| `CODE_MODE` | `title` | `title` (one code shared by every copy) or `copy` (unique per copy) |
| `ORDER_NUMBER` | `required` | The order number at sign-up: `required`, `optional` or `off`. Format-checked only, stored as a keyed hash, deleted when access ends |
| `PREVIEW_MODE` | `1` on the live server for now | `1` lets anyone browse every screen without logging in as a shared sample family (the back office stays locked). **Set to `0` before launch** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | none | Creates or updates the admin login at deploy. Without them, the default demo admin is deleted |
| `ALLOW_DEMO_CODES` | unset | `1` lets the `DEMO-*` codes work in production. Leave unset |

## Adding or changing a book

1. Put the bank JSON in `content/inkworks/` (format in `docs/CONTENT_SCHEMA.txt`). Run the book's Python checker in the book workspace first: they read source files that only exist there.
2. `npx tsx scripts/validate-inkworks.ts`. The importer refuses any bank that fails.
3. Add the id to `src/practice/bookOrder.ts` for its place in the lists.
4. Commit and deploy. The import is idempotent and skips unchanged books.

## Deploying

```bash
deploy/deploy.sh                    # build here, sync, migrate, import, tidy (removes the default admin and demo parent), reload pm2
```

The build happens on the Mac (the server has about 1 GB spare). `data/db/*.sqlite` holds live accounts and is **never** copied from here. `--seed-db` was a one-off on 1 October 2026: do not run it again, it overwrites the live database.

Server tasks (run on the server in `/var/www/learnworks` after `set -a; . ./.env; set +a; export NODE_ENV=production`):

```bash
node dist/server-tasks.cjs backup                                     # also runs nightly via /etc/cron.d/learnworks-backup
node dist/server-tasks.cjs generate-codes --books y3maths --count 1   # prints plain codes once; only hashes are stored
node dist/server-tasks.cjs generate-codes --kind copy --count 2000 --books y3maths --out codes.csv
node dist/server-tasks.cjs remove-demo                                # delete the demo parent before launch
```

## Rules this site keeps (from the Inkworks brief)

- Accounts are for adults, or students 13+ on KS3/KS4 books. Under-13s are profiles (first name, year group) inside an adult account.
- Mailing list: separate, unticked, adults only; access never depends on it.
- No streaks, points, stars or leaderboards. Nothing mentions reviews.
- Light theme, Lexend + Andika, WCAG 2.2 AA, 48 px touch targets.
- Children are told their grown-up can see their scores.

## Marketing site and fonts

The public homepage lives in `src/marketing` (sections, copy, brand constants in `brand.ts`) with its styles and script in `public/site`. All class names carry an `ip-` prefix. The display face is **Gloock from Adobe Fonts** via the kit in `FONT_KIT` (domains allowed on the kit: mylearn.works, www.mylearn.works, localhost; add any new domain in your Adobe Fonts kit settings). The wordmark is live text. Covers, icons and the social card are drawn from `src/marketing/art` by `python3 src/marketing/tools/build_assets.py && node src/marketing/tools/render-art.mjs` (text in those uses Montserrat ExtraBold, an open-licence font).

## Layout

```
src/practice/      Inkworks engine: schema, marking, mastery, player, diagrams, importer (ported from the Companion site)
src/app/(marketing)/  public homepage (own root layout and CSS, rebranded from the Connect template; assets in public/site)
src/app/(app)/        everything behind the header: books, dashboard, me (child home), account, admin, curriculum
src/app/(app)/dashboard/  parent dashboard: src/lib/dashboard.ts (numbers), src/lib/recommend.ts (recommended panel), src/components/shell + charts
src/lib/sample.ts     sample learner used when an admin previews parent/child views
src/lib/           database, auth (sessions, PIN lock), redemption rules, repo queries
ingest/            Oak, GOV.UK and STA harvesters
db/migrations/     SQLite migrations, applied automatically
content/inkworks/  the 8 book banks (source of truth)
deploy/            deploy.sh, nginx vhost
```
