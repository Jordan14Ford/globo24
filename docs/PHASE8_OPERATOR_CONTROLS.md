# Phase 8 — Manual/dry/test send + safe operator controls

Phase 8 adds explicit send modes and guardrails for safer operator workflows.

## Send modes

| `SEND_MODE` | Behavior |
|-------------|----------|
| `live` (default) | Sends to `EMAIL_TO` |
| `test` | Sends to `SEND_TEST_TO` if set, otherwise **`EMAIL_TO`** (same as live inbox) |
| `dry-run` | Validates digest + recipients; **does not send** |

Shortcuts:

- `npm run send` → default/live behavior
- `npm run send:dry-run`
- `npm run send:test` (uses existing `output/digest.html`)
- `npm run pipeline:test` — run pipeline first, then test send (always matches latest editorial layout + stories)

## Safety controls

| Variable | Description |
|----------|-------------|
| `SEND_ALLOWLIST` | Comma-separated emails/domains allowed as recipients. Any non-matching recipient aborts send. |
| `SEND_REQUIRE_CONFIRM` | If true in `live` mode, requires `SEND_CONFIRM=SEND` to proceed. |
| `SEND_CONFIRM` | Confirmation token used with `SEND_REQUIRE_CONFIRM=true`. |

`test` mode also respects `SEND_ALLOWLIST`.

## Orchestrator behavior

`scripts/orchestrate.ts` now only appends `data/send-history.json` dedupe records when a send is actually delivered.  
If `SEND_MODE=dry-run`, orchestrator logs `NO-SEND` and does **not** consume the slot key.

## Run history

Run history rows (`data/run-history.json`) include `sendMode` for `send` and `orchestrate` kinds.

## Verification

```bash
npx tsc --noEmit
npm run pipeline
npm run send:dry-run
npm run send:test   # uses SEND_TEST_TO or EMAIL_TO; override: SEND_TEST_TO=other@… npm run send:test
SEND_REQUIRE_CONFIRM=true npm run send   # should fail without SEND_CONFIRM=SEND
```
