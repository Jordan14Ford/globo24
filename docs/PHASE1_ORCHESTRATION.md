# Phase 1 — Timezone-safe scheduling & dedupe

The **orchestrator** (`npm run orchestrate` / `npm run run:scheduled`) wraps the existing **`npm run pipeline`** + **`sendDigest`** flow:

1. **America/New_York** send windows (default): **09:00–09:18** and **17:30–17:48** local Eastern (Luxon; EST/EDT automatic). Extra slack helps CI runners queue without missing the slot.
2. **Duplicate prevention**: after a successful send, a record is appended to **`data/send-history.json`** (or **`SEND_HISTORY_PATH`**) keyed by **`slotKey`** (e.g. `2025-03-19-morning`, `2025-03-19-evening`, or `2025-03-19-manual` when forced).
3. **Clear logs**: `[orchestrate] SKIP — …` or `[orchestrate] PROCEED — …` then pipeline output.

Unchanged scripts:

- **`npm run pipeline`** — build digest only.
- **`npm run send`** — send existing `output/` digest only.
- **`npm run run:all`** — `pipeline && send` with **no** time gate or history (operator override).

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `ORCHESTRATE_MODE` | `auto` | `auto` = gate on ET windows; `force` = run anytime (dedupe still applies); `dry-run` = log decision, exit 0. |
| `SKIP_DEDUPE` | — | Set `1` or `true` to allow another send for the same `slotKey` (use sparingly). |
| `SEND_HISTORY_PATH` | `./data/send-history.json` | JSON file for idempotency. |

See [`.env.example`](../.env.example).

## Local verification checklist

Run from repo root `global-news-pipeline/`:

### 1. Typecheck

```bash
npm install
npx tsc --noEmit
```

Expect: no errors.

### 2. Dry-run (no pipeline, no send)

```bash
ORCHESTRATE_MODE=dry-run npx tsx scripts/orchestrate.ts
```

Expect: `[orchestrate] decision` with `action`, `reason`, `slotKey`; **exit code 0**. No `data/send-history.json` created unless you already had one (dry-run skips `ensureHistoryFileExists`).

### 3. Auto mode outside windows (skip)

Pick a time **not** in 09:00–09:18 or 17:30–17:48 Eastern, or temporarily patch `types/schedule.ts` `DEFAULT_WINDOW_MINUTES` / `eastern.ts` in a throwaway branch for testing.

```bash
ORCHESTRATE_MODE=auto npx tsx scripts/orchestrate.ts
```

Expect: `[orchestrate] SKIP — outside Eastern send windows` (or similar); **exit code 0**.

### 4. Force mode (bypass window; needs real email + prior pipeline output)

```bash
npm run pipeline
ORCHESTRATE_MODE=force npx tsx scripts/orchestrate.ts
```

Expect: `PROCEED`, pipeline runs, email send, `DONE — send recorded`. History file contains `slotKey` ending in `-manual` for that Eastern **date**.

Second run same day without `SKIP_DEDUPE`:

```bash
ORCHESTRATE_MODE=force npx tsx scripts/orchestrate.ts
```

Expect: `SKIP — duplicate send already recorded for slotKey=...`; exit 0.

### 5. Legacy commands unchanged

```bash
npm run pipeline
npm run send
npm run run:all
```

Expect: same behavior as before Phase 1 (no schedule gate).

## GitHub Actions

Workflow: [`.github/workflows/global-news-digest.yml`](../.github/workflows/global-news-digest.yml) (or monorepo root copy — see **[GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)**).

- **Cron** (UTC): `0 13,14 * * *` and `30 21,22 * * *` — aligns with **~09:00** and **~17:30 America/New_York**; the **orchestrator** enforces **09:00–09:18** and **17:30–17:48** in code (absorbs short queue delay).
- **`workflow_dispatch`**: input **force_run** (default **true**) → `ORCHESTRATE_MODE=force` to bypass the window; set **false** to behave like scheduled runs (`auto`). Still dedupes on `YYYY-MM-DD-manual` when forced unless `SKIP_DEDUPE=1`.
- **Cache**: `data/send-history.json` is restored/saved so duplicate prevention persists across workflow runs (not perfect across all edge cases, but sufficient for typical scheduled usage).

See also **[GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)**.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Always skips in `auto` | Confirm runner clock; log prints Eastern time in decision (see `scheduleDecision` / `eastern.ts`). |
| Duplicate emails | Ensure `SKIP_DEDUPE` is unset; verify history path is writable and shared in CI via cache. |
| Send fails after pipeline | Resend/SMTP env; `output/digest.html` exists after `pipeline`. |
