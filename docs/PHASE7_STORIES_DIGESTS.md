# Phase 7 — `/stories` and `/digests` from real data

Phase 7 adds persisted story and digest records generated directly from each successful pipeline run, and exposes them in the admin API/UI.

## Data stores

- `data/stories.json` — flattened story rows from pipeline output
- `data/digests.json` — per-run digest summaries

Both are append-only (capped) and git-ignored.

Implementation:

- [`types/content.ts`](../types/content.ts)
- [`lib/content/contentStore.ts`](../lib/content/contentStore.ts)
- Hooked in [`scripts/runPipeline.ts`](../scripts/runPipeline.ts)

## Admin APIs

- `GET /api/stories`
- `GET /api/digests`

Implemented in [`scripts/adminServer.ts`](../scripts/adminServer.ts).

## Admin UI

Added tabs in [`admin/index.html`](../admin/index.html):

- **Stories** — recent story rows
- **Digests** — recent digest summaries

## Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `STORY_HISTORY_MAX` | `5000` | Keep N newest stories |
| `DIGEST_HISTORY_MAX` | `1000` | Keep N newest digests |

## Verification

```bash
npx tsc --noEmit
npm run pipeline
npm run admin
# open / and check Stories + Digests tabs
```
