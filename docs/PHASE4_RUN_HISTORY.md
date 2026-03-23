# Phase 4 — Run history, artifacts, structured logs

Phase 4 adds **durable observability** for local runs and CI without changing pipeline semantics.

## Run history

**File:** `data/run-history.json` (or **`RUN_HISTORY_PATH`**) — JSON `{ version: 1, records: [...] }`, append-only, capped (default **500** newest).

**Kinds:**

| `kind` | When |
|--------|------|
| `pipeline` | After `npm run pipeline` succeeds or throws |
| `send` | After `npm run send` succeeds or throws |
| `orchestrate` | After `npm run orchestrate` completes pipeline + send (or fails mid-run) |

**Disable:** `RUN_HISTORY=0` (or `false` / `off`).

**Trim:** `RUN_HISTORY_MAX_RECORDS` (default `500`).

**IDs:** Each invocation gets a **`runId`** (UUID). The orchestrator passes **`PIPELINE_RUN_ID`** into the child `npm run pipeline` so pipeline + orchestrate rows share one id.

**Phase 5 note:** records can include `agentIds` (enabled agents at runtime) when the agent registry is active.

## Artifact snapshots

When **`RUN_ARTIFACTS=1`** (or `true` / `yes` / `on`), the contents of **`output/`** are copied to **`data/runs/<runId>/`** after a successful write. The run-history row includes **`artifactsRelPath`** (e.g. `data/runs/<uuid>`).

Snapshots work even if **`RUN_HISTORY=0`** (history off, copy still runs when `RUN_ARTIFACTS` is on).

## Structured logs

**`PIPELINE_LOG_FORMAT=json`** — emit **one JSON object per line** for:

- `scripts/runPipeline.ts` (component `pipeline`, events like `pipeline_start`, `output_written`, `pipeline_complete`, `pipeline_failure`)
- `scripts/orchestrate.ts` (component `orchestrate`, fields `message` / `data`)

Default remains human-readable **`[pipeline]`** / **`[orchestrate]`** text.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `RUN_HISTORY` | on | Set `0` to disable append to run history. |
| `RUN_HISTORY_PATH` | `./data/run-history.json` | Alternate path. |
| `RUN_HISTORY_MAX_RECORDS` | `500` | Keep only the N most recent records. |
| `RUN_ARTIFACTS` | off | `1` to snapshot `output/` → `data/runs/<runId>/`. |
| `PIPELINE_LOG_FORMAT` | `text` | Set `json` for structured lines. |
| `PIPELINE_RUN_ID` / `RUN_ID` | — | Optional fixed id (orchestrator sets `PIPELINE_RUN_ID` for the child pipeline). |

See [`.env.example`](../.env.example).

## Verification

```bash
npx tsc --noEmit
npm run pipeline   # then inspect data/run-history.json (if RUN_HISTORY on)
RUN_ARTIFACTS=1 npm run pipeline
ls data/runs/
PIPELINE_LOG_FORMAT=json npm run pipeline
```

## Git

`data/run-history.json` and `data/runs/*` are **ignored**; `data/runs/.gitkeep` keeps the folder in the repo.
