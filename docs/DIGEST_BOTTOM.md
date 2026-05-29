# Digest bottom: Reddit + earnings

The topics pipeline can append a **“More at the bottom”** block to the HTML/text digest (above the small Globo footer).

## What it includes

1. **Reddit** — configured subreddit sections via Reddit listing JSON (`hot`, `top-day` by default), with RSS fallback and optional OAuth:
   - r/worldnews, r/geopolitics, r/artificial, r/MachineLearning, r/LocalLLaMA, r/technology, r/design, r/UI_Design, r/economics, r/MacroEconomics, r/StockMarket, r/investing
   Config: `config/redditDigest.ts`. Env: `REDDIT_POSTS_PER_SUB` (default 3), `REDDIT_SORTS`, and optional `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.
   **Note:** Public Reddit endpoints can return **403** to server-side fetches; OAuth credentials are recommended for scheduled Actions runs.

2. **Earnings this week** — Monday–Sunday in **America/New_York**:
   - With **`FMP_API_KEY`**: rows from [Financial Modeling Prep](https://site.financialmodelingprep.com/) `earning_calendar`.
   - Without a key: empty table + short note; **links still work**.

3. **Links**
   - **`EARNINGS_CALENDAR_URL`** — defaults to Yahoo’s earnings calendar.
   - **`EARNINGS_YOUTUBE_URL`** — optional; paste any YouTube URL (channel, playlist, or search results for “earnings this week”).

## Env vars

| Variable | Purpose |
|----------|---------|
| `DIGEST_BOTTOM_SECTIONS` | `0` / `false` / `no` to disable the whole block |
| `REDDIT_POSTS_PER_SUB` | 1-15, default 3 |
| `REDDIT_SORTS` | Comma-separated listing sources, default `hot,top-day` |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Optional Reddit OAuth credentials for scheduled server-side pulls |
| `FMP_API_KEY` | Populate the earnings table |
| `EARNINGS_CALENDAR_URL` | Outbound “Full earnings calendar” link |
| `EARNINGS_YOUTUBE_URL` | Outbound “YouTube (your pick)” link |

## Pipeline

`scripts/runPipeline.ts` calls `buildDigestBottomPayload()` after URL resolution and attaches `digestBottom` to `MasterCuratedOutput` (also in `output/pipeline-output.json`).
