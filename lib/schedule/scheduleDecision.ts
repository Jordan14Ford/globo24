/**
 * Pure schedule decision model: proceed vs skip with explicit reasons (for logs and tests).
 */
import { DateTime } from "luxon";
import {
  DEFAULT_WINDOW_MINUTES,
  type DecideOptions,
  type OrchestrateMode,
  type ScheduleDecision,
} from "../../types/schedule";
import {
  EASTERN_TZ,
  buildSlotKey,
  checkSendWindow,
} from "./eastern";

export type { DecideOptions, OrchestrateMode, ScheduleDecision } from "../../types/schedule";
export { isProceedDecision } from "../../types/schedule";

/**
 * - `auto`: proceed only inside 09:00–11:59 or 17:30–19:59 America/New_York (wide for CI schedule jitter).
 * - `force`: proceed without time gate; slotKey = `YYYY-MM-DD-manual` (Eastern date) for dedupe.
 * - `dry-run`: always skip with explanation (no pipeline/send).
 */
export function decideSchedule(
  mode: OrchestrateMode,
  options: DecideOptions = {}
): ScheduleDecision {
  const wm = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const nowEt = options.nowIso
    ? DateTime.fromISO(options.nowIso, { setZone: true }).setZone(EASTERN_TZ)
    : DateTime.now().setZone(EASTERN_TZ);

  if (mode === "dry-run") {
    const w = checkSendWindow(nowEt, wm);
    return {
      action: "skip",
      reason: `[dry-run] no pipeline/send; now=${nowEt.toISO()} (${EASTERN_TZ}) inWindow=${w.inWindow} — ${w.detail}`,
    };
  }

  if (mode === "force") {
    const slotDate = nowEt.toFormat("yyyy-MM-dd");
    const slotKey = `${slotDate}-manual`;
    const w = checkSendWindow(nowEt, wm);
    return {
      action: "proceed",
      reason: "ORCHESTRATE_MODE=force — time windows bypassed; dedupe uses Eastern calendar manual slotKey",
      slotKey,
      slot: "morning",
      slotDate,
      window: w,
    };
  }

  const w = checkSendWindow(nowEt, wm);
  if (!w.inWindow || !w.slot) {
    return {
      action: "skip",
      reason: `Not in send window: ${w.detail}`,
    };
  }

  const slotKey = buildSlotKey(w.slotDate, w.slot);
  return {
    action: "proceed",
    reason: w.detail,
    slotKey,
    slot: w.slot,
    slotDate: w.slotDate,
    window: w,
  };
}
