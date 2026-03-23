# GitHub Actions — scheduled digest

**Step-by-step:** **[SETUP_GITHUB_ACTIONS_CHECKLIST.md](./SETUP_GITHUB_ACTIONS_CHECKLIST.md)** (phased checklist aligned with Phase 1 + architecture goals).

### Sync secrets from your machine (CLI)

If **`gh`** is logged in (`gh auth login`) and your **`.env`** is filled:

```bash
npm run gha:secrets
# or: npx tsx scripts/syncGithubSecrets.ts --repo YOUR_ORG/YOUR_REPO
```

This sets **`RESEND_API_KEY`**, **`EMAIL_FROM`**, **`EMAIL_TO`**, and optionally **`EMAIL_SUBJECT`** / **`OPENAI_API_KEY`**. Nothing is printed except key names.

Workflow file: [`.github/workflows/global-news-digest.yml`](../.github/workflows/global-news-digest.yml)

## Repository layout

- **Repo root = `global-news-pipeline`:** Use [`.github/workflows/global-news-digest.yml`](../.github/workflows/global-news-digest.yml) in this folder (default paths).
- **Repo root = `DC Vibecodathon` monorepo:** Use **`.github/workflows/global-news-digest.yml`** at the **repository root** (included in the parent folder) — it sets `working-directory: global-news-pipeline` and cache paths accordingly. Nested `global-news-pipeline/.github/` is ignored by GitHub in that layout.

## Secrets (repository → **Settings → Secrets and variables → Actions**)

| Secret | Required | Description |
|--------|----------|-------------|
| `RESEND_API_KEY` | Yes* | Resend API key (`re_...`) |
| `EMAIL_FROM` | Yes | Sender, e.g. `Digest <onboarding@resend.dev>` or your verified domain |
| `EMAIL_TO` | Yes | Recipient(s); comma-separated for multiple |
| `EMAIL_SUBJECT` | No | Overrides default subject |
| `OPENAI_API_KEY` | No | If omitted, master/ranker use **keyword fallback** (no API cost) |

\*Or use SMTP from your runner by changing the project to read SMTP env vars in CI — the default [`sendEmail.ts`](../scripts/sendEmail.ts) uses Resend when `RESEND_API_KEY` is set.

## Variables (optional, **Settings → Secrets and variables → Actions → Variables**)

| Variable | Example | Description |
|----------|---------|-------------|
| `PIPELINE_MODE` | `topics` | `topics` (default) or `regions` |
| `OPENAI_MASTER_MODEL` | `gpt-4o-mini` | Topic master curator model |
| `OPENAI_RANK_MODEL` | `gpt-4o-mini` | Legacy regions ranker model |
| `TOP_STORIES_PER_TOPIC` | `10` | Stories per topic |
| `MAX_CANDIDATES_PER_TOPIC` | `80` | Cap before curation |

## Disabling the old Python `news-agent` workflow

The **Regional News Digest** workflow in the `news-agent` repo had its **`schedule` trigger removed** so it no longer runs every 5 minutes. You can still run it **manually** via `workflow_dispatch`, or disable that workflow entirely in the Actions UI.

## Schedule (Phase 1 orchestrator)

The workflow uses **two cron lines** (UTC) so runs land near **09:00** and **17:30 America/New_York** year-round (EST vs EDT):

- `0 13,14 * * *` — one of these hits the **morning** window.
- `30 21,22 * * *` — one of these hits the **evening** window (~**5:30 PM** Eastern).

The orchestrator (`npm run orchestrate`) **re-checks** Luxon windows (**09:00–09:18** and **17:30–17:48** `America/New_York`). Runs that fall outside those windows exit **0** with a skip log (e.g. the “wrong” UTC hour for that season).

- **Scheduled** (`on.schedule`): `ORCHESTRATE_MODE=auto` (time gate + dedupe).
- **Manual** (`workflow_dispatch`): **force_run** (default on) → `ORCHESTRATE_MODE=force`; turn off for `auto` (same as cron). Still dedupes per Eastern calendar day on `*-manual` when forced unless `SKIP_DEDUPE=1`.

**Send history** is cached between runs via `actions/cache` on `data/send-history.json` so duplicate-send prevention persists. See **[PHASE1_ORCHESTRATION.md](./PHASE1_ORCHESTRATION.md)** for local verification steps.

To change **allowed send times**, edit `lib/schedule/eastern.ts`. If you change window **length** or **minute**, adjust the workflow UTC crons if needed so triggers still fall inside the window.
