/**
 * **Scheduling & orchestration domain types (Phase 2)**
 *
 * Pure types and constants — no I/O, filesystem, or wall-clock calls.
 * Implementations: `lib/schedule/eastern.ts`, `lib/schedule/scheduleDecision.ts`, `lib/schedule/sendHistory.ts`.
 *
 * @see docs/ARCHITECTURE.md
 */

/** IANA timezone for all schedule gates (EST/EDT via runtime, e.g. Luxon). */
export const EASTERN_TZ = "America/New_York" as const;

/**
 * Legacy default for `checkSendWindow(..., windowMinutes)` — **ignored**; windows are fixed ranges in `eastern.ts`
 * so daily CI can land hours late and still send once per morning / once per evening.
 */
export const DEFAULT_WINDOW_MINUTES = 18;

/** Calendar bucket for a scheduled send (not used for `manual` forced runs in logs). */
export type SendSlot = "morning" | "evening";

/**
 * Result of evaluating “are we inside a morning/evening window?” at an instant in Eastern local time.
 */
export interface WindowCheck {
  inWindow: boolean;
  slot: SendSlot | null;
  /** Calendar date in Eastern (YYYY-MM-DD). */
  slotDate: string;
  /** Human-readable detail for logs. */
  detail: string;
}

export type OrchestrateMode = "auto" | "force" | "dry-run";

/**
 * Outcome of `decideSchedule`: either skip (with reason) or proceed with slot metadata for dedupe.
 */
export type ScheduleDecision =
  | {
      action: "proceed";
      reason: string;
      slotKey: string;
      slot: SendSlot;
      slotDate: string;
      window: WindowCheck;
    }
  | {
      action: "skip";
      reason: string;
      slotKey?: string;
    };

export interface DecideOptions {
  /** Override clock (ISO 8601), for tests. */
  nowIso?: string;
  windowMinutes?: number;
}

/** How the digest was delivered (matches `SendDigestResult` in `lib/email/sendDigest.ts`). */
export type DigestEmailProvider = "resend" | "smtp";

/** One persisted send for idempotency (`data/send-history.json`). */
export interface SendHistoryRecord {
  slotKey: string;
  sentAt: string;
  provider?: DigestEmailProvider;
  messageId?: string;
}

export interface SendHistoryFile {
  version: 1;
  records: SendHistoryRecord[];
}

/** Narrow `ScheduleDecision` after handling `skip`. */
export function isProceedDecision(
  d: ScheduleDecision
): d is Extract<ScheduleDecision, { action: "proceed" }> {
  return d.action === "proceed";
}
