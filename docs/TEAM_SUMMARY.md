# Global News Pipeline — Dev Team Summary

> Last updated: 2026-03-24

## What it does

**Global News Pipeline** (codename: *Globo News 24*) is a fully automated news digest system. Twice a day it ingests news across four topic pillars (today primarily via RSS), uses OpenAI to curate the best stories, compiles them into a formatted email digest, and delivers it via Resend. It runs on GitHub Actions with zero manual intervention.

**Roadmap:** move from RSS-only toward **allowlisted website sections and article discovery**, still feeding the same master curator — see [`docs/GLOBO_DIGEST_PLAN.md`](GLOBO_DIGEST_PLAN.md).

---

## Architecture at a glance

```
RSS Feeds (Google News + BBC + Bloomberg + CNBC + ZeroHedge + Naked Capitalism)
    |
    v
[Stage 1 — Search]       agents/topicAgent.ts
  Parallel RSS fetch per topic (tech, geopolitics, macro, economics)
  Normalize links, filter by allowed host list, dedupe, cap at 80 candidates/topic
    |
    v
[Stage 2 — Review]       agents/masterAgent.ts
  OpenAI gpt-4o-mini selects best N stories per topic (JSON mode)
  Fallback: deterministic keyword scoring + clickbait penalty + recency boost
    |
    v
[Stage 3 — Compile]      agents/brutalistEditor.ts
  Builds output/digest.html + output/digest.txt
  Appends Reddit hot posts + weekly earnings calendar at the bottom
    |
    v
[Stage 4 — Deliver]      lib/email/sendDigest.ts
  Sends multipart email via Resend (or SMTP)
  Supports live / test / dry-run send modes
```

Supplements appended to every digest:
- **Reddit hot posts** — top daily posts from configured subreddits (no OAuth, uses public JSON API)
- **Earnings calendar** — top 25 companies reporting that week, sourced from Nasdaq API (no key required)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 20, TypeScript, `tsx` (no build step needed) |
| AI curation | OpenAI Chat Completions (`gpt-4o-mini` default, configurable) |
| Email delivery | Resend (primary) / Nodemailer SMTP (fallback) |
| RSS parsing | `rss-parser` |
| Scheduling | GitHub Actions cron + Eastern timezone gate (`luxon`) |
| Secrets | GitHub Actions secrets + `.env` for local dev |

---

## Scheduling & deduplication

The pipeline runs via GitHub Actions on a cron schedule targeting one morning and one evening send per Eastern calendar day. The orchestrator is the source of truth for these windows:

- Morning: 09:00-10:00 ET
- Evening: 16:00-18:00 ET

Each run checks `data/send-history.json` (persisted via Actions cache) before sending — so even if the cron fires multiple times in a window, it only sends once per slot.

**Orchestrate modes** (set via `ORCHESTRATE_MODE` env):

| Mode | Behavior |
|------|----------|
| `auto` (default) | Respects ET windows + deduplication |
| `force` | Bypasses time window; still deduplicates on `manual` slot |
| `dry-run` | Logs decision only, exits 0 |

Manual trigger: `workflow_dispatch` in GitHub Actions with `force_run: true`.

---

## Source configuration

Four topic pillars, each pulling from Google News RSS + shared supplemental publisher feeds:

| Topic | Google News Query | Supplements |
|-------|-------------------|-------------|
| `tech` | AI, semiconductor, software, cybersecurity | BBC Technology + shared* |
| `geopolitics` | diplomacy, sanctions, NATO, conflict, elections | BBC World + shared* |
| `macro` | central banks, rates, inflation, Fed, ECB, FX | BBC Business + shared* |
| `economics` | GDP, recession, unemployment, trade, tariffs, IMF | BBC Economy + shared* |

*Shared: ZeroHedge, Naked Capitalism, Bloomberg Markets, CNBC Top News

Allowed host list is explicit — no arbitrary domains slip through (`config/topicFeeds.ts`).

---

## AI curation logic

`masterAgent.ts` sends all candidate articles (title + summary snippet) to OpenAI in a single call and asks it to return array indices of the best stories per topic for a "senior macro reader." Temperature is set to 0.15 for consistency.

**Fallback** (no API key or OpenAI error):
- Keyword scoring per topic
- Clickbait pattern penalties (e.g. "stocks to buy", "millionaire", "X reasons why")
- Recency boost (articles <6h old get +2, <24h +1, <48h +0.5)
- Publisher diversity cap (max 2 articles per domain)
- Cross-topic URL deduplication

---

## Key npm scripts

```bash
npm run pipeline          # Run fetch + curate + compile (produces output/digest.html)
npm run pipeline:slice    # Same but for one topic only (PIPELINE_SLICE_TOPICS=tech)
npm run send              # Send the latest compiled digest
npm run send:dry-run      # Test without actually sending
npm run send:test         # Send to a test address only
npm run run:all           # pipeline + send in sequence
npm run orchestrate       # Full orchestration (schedule gate + pipeline + send)
npm run admin             # Start local admin HTTP server (port varies)
npm run gha:secrets       # Sync .env secrets to GitHub Actions
```

---

## Environment variables

```
# Required
OPENAI_API_KEY       OpenAI API key (optional — falls back to keyword curation if missing)
RESEND_API_KEY       Resend API key for email delivery
EMAIL_FROM           Sender address (must be verified in Resend)
EMAIL_TO             Recipient address(es)

# Optional
EMAIL_SUBJECT        Subject line (default: "Globo News 24")
OPENAI_MASTER_MODEL  Model for curation (default: gpt-4o-mini)
ORCHESTRATE_MODE     auto | force | dry-run (default: auto)
SEND_MODE            live | test | dry-run (default: live)
PIPELINE_MODE        topics only (default); regional pipeline retired
PIPELINE_SLICE       1 to run only a subset of topics
PIPELINE_SLICE_TOPICS Comma-separated topic ids (default: tech)
SEND_ALLOWLIST       Comma-separated addresses; restricts delivery
REDDIT_POSTS_PER_SUB Number of posts per subreddit (default: 6)
PIPELINE_LOG_FORMAT  json for structured logging
```

---

## Project structure

```
agents/          RSS fetch, AI curation, email formatting logic
config/          Topic feed URLs, Reddit subreddits, allowed hosts
lib/
  admin/         Settings store
  agents/        Agent registry (enable/disable per agent)
  content/       Story + digest persistence
  email/         sendDigest with mode/allowlist controls
  pipeline/      Slice configuration
  run/           Run ID, history, artifacts, structured logging
  schedule/      Eastern timezone logic, send-history deduplication
  supplements/   Reddit hot fetcher, Nasdaq earnings calendar fetcher
scripts/         Entry points: runPipeline, sendEmail, orchestrate, adminServer
types/           Shared TypeScript interfaces
config/          Feed configs
data/            Runtime JSON state (send-history, run-history, agent-registry, admin-settings)
output/          Last compiled digest (digest.html, digest.txt, pipeline-output.json)
.github/workflows/ GitHub Actions CI definition
```

---

## Admin UI

`npm run admin` starts a local HTTP server serving `admin/index.html`. It exposes basic APIs for:
- System overview
- Agent enable/disable toggles
- Run history viewer
- Settings management
- Stories and digests surfaces

---

## Things to know

- **No long-running agent processes.** Each pipeline run is a single sequential script invocation. The "agents" are just functions.
- **OpenAI is optional.** The pipeline runs fully offline using the keyword fallback — useful for dev/testing without burning API credits.
- **Send history is the dedup source of truth.** It lives in `data/send-history.json`, persisted between GitHub Actions runs via cache. If you clear the cache, the next run will re-send for that slot.
- **Regional (`PIPELINE_MODE=regions`) mode is retired** — the pipeline exits with an error if set; GitHub Actions always runs **topics**.
- **Slice mode** (`PIPELINE_SLICE=1`) limits the pipeline to one or more topics, useful for partial debugging runs.
