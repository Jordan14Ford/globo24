# Global News Pipeline (Node.js + TypeScript)

End-to-end flow: **search for news → review & select stories → compile email body → send to your inbox** (`EMAIL_TO` in `.env`, default example targets the project owner’s Gmail).

**Architecture (detailed):** **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — stages, diagram, file map.

## Default pipeline (`PIPELINE_MODE=topics`)

| Stage | Responsibility | Main code |
|-------|----------------|-----------|
| **1. Search** | Four parallel “topic agents” fetch RSS (Google News + BBC + ZeroHedge / Naked Capitalism / Bloomberg / CNBC supplements) per pillar | [`agents/topicAgent.ts`](agents/topicAgent.ts), [`config/topicFeeds.ts`](config/topicFeeds.ts) |
| **2. Review** | One **master** step picks top stories per topic (OpenAI JSON, or keyword fallback) | [`agents/masterAgent.ts`](agents/masterAgent.ts) |
| **3. Compile** | Editorial HTML + plaintext digest (topics + regions) | [`agents/brutalistEditor.ts`](agents/brutalistEditor.ts) |
| **4. Send** | Resend or SMTP reads `output/` and mails to `EMAIL_TO` | [`scripts/sendEmail.ts`](scripts/sendEmail.ts) |

Article links are restricted to **allowed hostnames** (Google News + BBC supplements). Ingestion is **RSS + policy**, not arbitrary scraping.

## Regional (continent) pipeline

Set `PIPELINE_MODE=regions` for per-continent RSS from [`config/sources.ts`](config/sources.ts) and ranker per region. **HTML uses the same editorial digest layout** as topics ([`buildRegionalEditorialHtml`](agents/brutalistEditor.ts)); plain text still comes from [`agents/editor.ts`](agents/editor.ts).

## Layout

| Path | Role |
|------|------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stages diagram: search → review → compile → send |
| [`config/topicFeeds.ts`](config/topicFeeds.ts) | Topic IDs, Google News query URLs, BBC supplements, caps |
| [`config/sources.ts`](config/sources.ts) | Legacy region RSS + domains |
| [`agents/rssUtil.ts`](agents/rssUtil.ts) | Shared RSS parser + URL helpers |
| [`agents/topicAgent.ts`](agents/topicAgent.ts) | **Agent 1:** topic fetch + filter |
| [`agents/masterAgent.ts`](agents/masterAgent.ts) | **Agent 2:** curate (OpenAI or keyword fallback) |
| [`agents/brutalistEditor.ts`](agents/brutalistEditor.ts) | Compile HTML + plain text digest |
| [`agents/regionalAgent.ts`](agents/regionalAgent.ts) | Legacy regional fetch |
| [`agents/ranker.ts`](agents/ranker.ts) | Legacy per-region OpenAI rank |
| [`scripts/runPipeline.ts`](scripts/runPipeline.ts) | Entry: `topics` (default) or `regions` |
| [`scripts/sendEmail.ts`](scripts/sendEmail.ts) | Deliver: Resend or SMTP → `EMAIL_TO` |

## Setup

```bash
cd global-news-pipeline
npm install
cp .env.example .env
```

## Run

```bash
# Default: topics → master → brutalist digest
npm run pipeline

# Continents + same editorial HTML shell as topics
PIPELINE_MODE=regions npm run pipeline

npm run send
# or
npm run run:all

# Regenerate digest then send test (uses SEND_MODE=test)
npm run pipeline:test
```

### Scheduled / idempotent runs (Phase 1)

**`npm run orchestrate`** (alias: **`npm run run:scheduled`**) applies **Eastern time windows** and **send-history dedupe**, then runs the same pipeline + send as `run:all`. Use this for cron / GitHub Actions. **`npm run run:all`** stays a direct **pipeline → send** with no schedule.

Details and verification steps: **[docs/PHASE1_ORCHESTRATION.md](docs/PHASE1_ORCHESTRATION.md)**. Schedule domain types live in **[`types/schedule.ts`](types/schedule.ts)** — see **[docs/PHASE2_TYPES.md](docs/PHASE2_TYPES.md)**.

#### No terminal needed — GitHub Actions (9am & 5:30pm Eastern)

The workflow **[`.github/workflows/global-news-digest.yml`](.github/workflows/global-news-digest.yml)** triggers at UTC times that align with **~09:00** and **~17:30 America/New_York** (EST/EDT handled by the orchestrator’s Luxon window check). It runs **`npm run orchestrate`** → pipeline + **live** email (not test mode).

1. Push this repo to GitHub (if the repo root is the monorepo **`DC Vibecodathon`**, use **`.github/workflows/global-news-digest.yml`** at that root instead — it’s included there too).
2. Add **repository secrets**: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` (and optional `OPENAI_API_KEY`, `EMAIL_SUBJECT`).
3. Enable Actions on the repo. Scheduled runs need the default branch; forks may need **Settings → Actions → General** approval for schedules.

**Full phased checklist:** **[docs/SETUP_GITHUB_ACTIONS_CHECKLIST.md](docs/SETUP_GITHUB_ACTIONS_CHECKLIST.md)**.

Manual run: **Actions → Global News Pipeline Digest → Run workflow** (default **force** = runs immediately, bypasses the 9am/5:30pm window).

### Faster iteration — Phase 3 slice

Set **`PIPELINE_SLICE=1`** to run the same stages for a **subset** of topics (default **tech** only). Use **`PIPELINE_SLICE_TOPICS=tech,macro`** for multiple pillars. Details: **[docs/PHASE3_SLICE.md](docs/PHASE3_SLICE.md)**.

### Observability — Phase 4

**`data/run-history.json`** records pipeline / send / orchestrate runs; **`RUN_ARTIFACTS=1`** snapshots **`output/`** under **`data/runs/<runId>/`**; **`PIPELINE_LOG_FORMAT=json`** emits structured lines. Details: **[docs/PHASE4_RUN_HISTORY.md](docs/PHASE4_RUN_HISTORY.md)**.

### Controls — Phase 5 agent registry

Agent enable-state is centralized in **`data/agent-registry.json`** (optional overrides) plus env toggles **`AGENT_ENABLE`** / **`AGENT_DISABLE`**. Pipeline and send commands now gate execution by agent id (for example `topic.search`, `topic.master_review`, `delivery.email`). Details: **[docs/PHASE5_AGENT_REGISTRY.md](docs/PHASE5_AGENT_REGISTRY.md)**.

### Operations — Phase 6 admin UI

Run **`npm run admin`** and open **`http://localhost:8787`** for a local operator panel with **Overview**, **Agents**, **Runs**, and **Settings** sections. Details: **[docs/PHASE6_ADMIN_UI.md](docs/PHASE6_ADMIN_UI.md)**.

### Data surfaces — Phase 7 stories and digests

Pipeline runs now persist real-content rows to **`data/stories.json`** and **`data/digests.json`**, and the admin panel exposes them under **Stories** and **Digests**. Details: **[docs/PHASE7_STORIES_DIGESTS.md](docs/PHASE7_STORIES_DIGESTS.md)**.

### Operator safety — Phase 8

Send flow now supports **`SEND_MODE=live|test|dry-run`** plus guardrails (`SEND_ALLOWLIST`, `SEND_REQUIRE_CONFIRM`, `SEND_CONFIRM`). Use **`npm run send:dry-run`** and **`npm run send:test`** for safer operations. Details: **[docs/PHASE8_OPERATOR_CONTROLS.md](docs/PHASE8_OPERATOR_CONTROLS.md)**.

## Environment

| Variable | Description |
|----------|-------------|
| `PIPELINE_MODE` | `topics` (default) or `regions` |
| `OPENAI_API_KEY` | Enables master curator + legacy ranker |
| `OPENAI_MASTER_MODEL` | Topic digest curator (JSON). Default `gpt-4o-mini` |
| `OPENAI_RANK_MODEL` | Legacy `regions` ranker (JSON). Default `gpt-4o-mini` |
| `TOP_STORIES_PER_TOPIC` | Default `10` |
| `MAX_CANDIDATES_PER_TOPIC` | Default `80` |
| `EMAIL_FROM`, `EMAIL_TO`, … | See [`.env.example`](.env.example) |

## Email: Resend (recommended next step)

1. Copy [`.env.example`](.env.example) → `.env`.
2. Add `RESEND_API_KEY` from [Resend → API Keys](https://resend.com/api-keys).
3. Set `EMAIL_TO` to your inbox; set `EMAIL_FROM` to a sender Resend allows (verified domain **or** Resend’s test sender — see [docs/RESEND.md](docs/RESEND.md)).
4. Run `npm run pipeline && npm run send` (or `npm run run:all`).

Full walkthrough: **[docs/RESEND.md](docs/RESEND.md)**.

**GitHub Actions (daily schedule):** see **[docs/GITHUB_ACTIONS.md](docs/GITHUB_ACTIONS.md)** — secrets, cron time, monorepo notes.

## OpenAI models you can use

The pipeline calls **Chat Completions** with **`response_format: { type: "json_object" }`**. Use models your API key can access; names change over time — confirm in the [OpenAI models docs](https://platform.openai.com/docs/models) or list them in the dashboard.

| Model id (examples) | Typical use |
|---------------------|-------------|
| `gpt-4o-mini` | **Default** — cheap, good enough for picking story indices |
| `gpt-4o` | Stronger reasoning / fewer bad picks |
| `gpt-4.1-mini`, `gpt-4.1` | If enabled on your account (newer GPT-4.1 family) |
| `gpt-4-turbo` | Older but capable |
| `gpt-3.5-turbo` | Cheapest; JSON quality may be weaker |

Set in `.env`:

```env
OPENAI_MASTER_MODEL=gpt-4o-mini
OPENAI_RANK_MODEL=gpt-4o-mini
```

**Avoid** for this pipeline unless you test carefully: reasoning-only models (`o1`, `o3-*`, etc.) — they may behave differently with strict JSON + index picking. If you switch providers later, you’d change [`agents/masterAgent.ts`](agents/masterAgent.ts) / [`agents/ranker.ts`](agents/ranker.ts).

## Resend vs SMTP

- **Resend:** set `RESEND_API_KEY`; `EMAIL_FROM` must match an allowed Resend sender (verified domain or test rules in their dashboard).
- **SMTP:** omit `RESEND_API_KEY`; set `SMTP_*`.

## Notes

- Google News RSS is unofficial and may change; tune queries in `config/topicFeeds.ts`.
- For stronger “agentic” behavior later, add a **bounded second pass** (master proposes alternate search queries; code re-fetches RSS only).
