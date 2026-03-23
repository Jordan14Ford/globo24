# Phase 2 — Central domain types (scheduling)

Phase 2 moves **scheduling and send-history shapes** into a single module so the rest of the codebase imports **types** from one place and **behavior** from `lib/schedule/*`.

## Source of truth

| Module | Role |
|--------|------|
| [`types/schedule.ts`](../types/schedule.ts) | **Types + constants only:** `EASTERN_TZ`, `DEFAULT_WINDOW_MINUTES`, `SendSlot`, `WindowCheck`, `ScheduleDecision`, `OrchestrateMode`, `DecideOptions`, `SendHistoryRecord`, `SendHistoryFile`, `DigestEmailProvider`, `isProceedDecision()`. |
| [`lib/schedule/eastern.ts`](../lib/schedule/eastern.ts) | Luxon helpers: `checkSendWindow`, `buildSlotKey`, `nowEastern`. Re-exports Eastern constants/types from `types/schedule`. |
| [`lib/schedule/scheduleDecision.ts`](../lib/schedule/scheduleDecision.ts) | `decideSchedule()` — pure decision logic; re-exports schedule types for convenience. |
| [`lib/schedule/sendHistory.ts`](../lib/schedule/sendHistory.ts) | JSON persistence; re-exports `SendHistoryRecord` / `SendHistoryFile`. |
| [`lib/email/sendDigest.ts`](../lib/email/sendDigest.ts) | `SendDigestResult.provider` uses `DigestEmailProvider` from `types/schedule`. |

## Imports (recommended)

- **Scripts / apps:** `import type { OrchestrateMode } from "../types/schedule"` (or project-relative path).
- **Orchestrator flow:** use `isProceedDecision(decision)` after `decideSchedule()` to narrow `ScheduleDecision` to the proceed branch.

## Verification

```bash
npx tsc --noEmit
ORCHESTRATE_MODE=dry-run npx tsx scripts/orchestrate.ts
```

Behavior is unchanged from Phase 1; this phase is a **structural** refactor.
