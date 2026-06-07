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
 * - `auto`: proceed only inside 09:00-10:00 or 16:00-18:00 America/New_York.
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
  const scheduledSlot = options.scheduledSlot;

  if (scheduledSlot) {
    if (w.inWindow && w.slot === scheduledSlot) {
      const slotKey = buildSlotKey(w.slotDate, scheduledSlot);
      return {
        action: "proceed",
        reason: w.detail,
        slotKey,
        slot: scheduledSlot,
        slotDate: w.slotDate,
        window: w,
      };
    }

    const hour = nowEt.hour;
    const beforeTarget = scheduledSlot === "morning" ? hour < 9 : hour < 16;
    const afterCatchupCutoff = scheduledSlot === "morning" ? hour >= 16 : false;
    if (beforeTarget || afterCatchupCutoff) {
      return {
        action: "skip",
        reason: `Scheduled ${scheduledSlot} trigger is outside its target/catch-up period: ${w.detail}`,
      };
    }

    const slotDate = nowEt.toFormat("yyyy-MM-dd");
    const catchupWindow: typeof w = {
      inWindow: false,
      slot: scheduledSlot,
      slotDate,
      detail: `Scheduled ${scheduledSlot} catch-up after GitHub queue delay (now ${nowEt.toFormat("HH:mm:ss")} ${EASTERN_TZ})`,
    };
    return {
      action: "proceed",
      reason: catchupWindow.detail,
      slotKey: buildSlotKey(slotDate, scheduledSlot),
      slot: scheduledSlot,
      slotDate,
      window: catchupWindow,
    };
  }

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
