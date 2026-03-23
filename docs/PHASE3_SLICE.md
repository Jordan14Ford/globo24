# Phase 3 — Search → intel → editor → delivery (slice mode)

Phase 3 adds an optional **slice** of the default **topics** pipeline so you can run **fewer RSS searches** and a smaller master pass while keeping the same stages:

1. **Search** — `runTopicAgent` for each *selected* topic only  
2. **Intel** — `runMasterAgent` (OpenAI or keyword fallback)  
3. **Editor** — `buildBrutalistHtml` / `buildBrutalistPlain`  
4. **Delivery** — unchanged: `npm run send`, `npm run run:all`, or the Phase 1 **orchestrator** (no special slice flag required for send)

## Environment

| Variable | When | Description |
|----------|------|--------------|
| `PIPELINE_SLICE` | Optional | Set `1`, `true`, `yes`, or `on` to enable slice mode (topics pipeline only). |
| `PIPELINE_SLICE_TOPICS` | Optional | Comma-separated topic ids: `tech`, `geopolitics`, `macro`, `economics`. If **unset** in slice mode, defaults to **`tech`** only (single-topic path). |

**`PIPELINE_MODE=regions`** ignores slice (a warning is logged); slice applies only to **`PIPELINE_MODE=topics`**.

## Behavior

- **Full pipeline (default):** `PIPELINE_SLICE` unset or off → all four topics from [`config/topicFeeds.ts`](../config/topicFeeds.ts).
- **Slice:** only the configured topics are fetched and passed to `runMasterAgent`. Other topic sections in the digest show **(no stories)** in the brutalist layout.
- **Master (OpenAI):** when fewer than four topics are present, the user payload includes `sliceMode` and `sliceHint` so the model focuses selections on the topics that have candidates.

Implementation: [`lib/pipeline/sliceConfig.ts`](../lib/pipeline/sliceConfig.ts), wired in [`scripts/runPipeline.ts`](../scripts/runPipeline.ts).

## Verification

```bash
# Typecheck
npx tsc --noEmit

# One-topic slice (default tech) — faster than full run
PIPELINE_SLICE=1 npm run pipeline

# Two topics
PIPELINE_SLICE=1 PIPELINE_SLICE_TOPICS=tech,macro npm run pipeline

# Full chain including email (unchanged semantics; slice only affects pipeline)
PIPELINE_SLICE=1 npm run run:all
```

Inspect `output/digest.html` and `output/pipeline-output.json`; notes should include `[PIPELINE_SLICE: …]` when slice mode is on.

**npm:** `npm run pipeline:slice` is shorthand for `PIPELINE_SLICE=1` + default topic **`tech`** (Unix/macOS). On Windows, set the vars in `.env` or use your shell’s equivalent.
