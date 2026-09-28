# VM Price Board

Ranks VM/sandbox providers for AI agents by what a given machine costs per month.
A Cloudflare Worker serves the page and re-checks every provider's pricing pages
each Monday. When a page's text changes, Claude re-extracts the rates into a fixed
schema.

## Setup

```sh
npm install
npx wrangler d1 create vm-price-board
npx wrangler d1 migrations apply vm-price-board --remote
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

## How the weekly job decides

1. Fetch each provider's sources. If the text hash matches the last successful run, stop.
2. Otherwise send the text plus the current record to Claude and get an updated record back.
3. If no price-bearing field changed, store it quietly (`price_changed = 0`).
4. If prices changed and pass the checks, publish. If a rate is out of range, the extractor
   reports low confidence, or the 2 vCPU / 4 GB reference machine moves more than ±50%,
   store it as `flagged`. The old price stays live and the page shows "Update awaiting review".

## Running it from the terminal

Run the job now against production (the Worker runs locally, writing to the live database):

```sh
npm run refresh
```

Or against the local database: `npm run dev`, then `curl "http://localhost:8787/__scheduled?cron=17+6+*+*+1"`.

Otherwise it runs on its own every Monday at 06:17 UTC.

See held updates:

```sh
npx wrangler d1 execute vm-price-board --remote --command \
  "SELECT id, provider_id, created_at, changes, problems FROM snapshots WHERE status = 'flagged'"
```

Approve or reject one:

```sh
npx wrangler d1 execute vm-price-board --remote --command "UPDATE snapshots SET status = 'published' WHERE id = 42"
npx wrangler d1 execute vm-price-board --remote --command "UPDATE snapshots SET status = 'rejected' WHERE id = 42"
```

Make the next run re-read a provider even if its page didn't change:

```sh
npx wrangler d1 execute vm-price-board --remote --command "DELETE FROM checks WHERE provider_id = 'sprites'"
```

Watch a run's results: `npx wrangler tail` (each provider logs one JSON outcome line).

## Adding a provider

Add an entry to `src/providers.ts` (prefer `pricing.md` / `llms.txt` style sources)
and a baseline record to `src/seed.ts`, then deploy.
