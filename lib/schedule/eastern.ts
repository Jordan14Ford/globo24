/**
 * America/New_York is the single source of truth for send windows (handles EST/EDT via Luxon).
 */
import { DateTime } from "luxon";
import {
  DEFAULT_WINDOW_MINUTES,
  EASTERN_TZ,
  type SendSlot,
  type WindowCheck,
} from "../../types/schedule";

export {
  DEFAULT_WINDOW_MINUTES,
  EASTERN_TZ,
  type SendSlot,
  type WindowCheck,
} from "../../types/schedule";

/**
 * True if `dt` (any zone) falls in a morning or evening send window in Eastern time.
 *
 * **Wide windows** so GitHub’s scheduled `workflow` can start hours late and still classify as the
 * intended daily morning (≈09:00) or evening (≈17:30) edition. Dedupe (`slotKey` per calendar day + slot)
 * still guarantees at most one send each.
 *
 * @param _windowMinutes Kept for API compatibility; not used (fixed ranges below).
 */
export function checkSendWindow(dt: DateTime, _windowMinutes: number = DEFAULT_WINDOW_MINUTES): WindowCheck {
  const local = dt.setZone(EASTERN_TZ);
  const hour = local.hour;
  const minute = local.minute;
  const slotDate = local.toFormat("yyyy-MM-dd");

  // Morning edition target ~09:00 ET — allow 09:00–11:59 (queue jitter, slow runners).
  if (hour >= 9 && hour < 12) {
    return {
      inWindow: true,
      slot: "morning",
      slotDate,
      detail: `Morning window 09:00–11:59 ${EASTERN_TZ}`,
    };
  }

  // Evening edition target ~17:30 ET — allow 17:30–19:59.
  const inEvening =
    (hour === 17 && minute >= 30) || hour === 18 || hour === 19;

  if (inEvening) {
    return {
      inWindow: true,
      slot: "evening",
      slotDate,
      detail: `Evening window 17:30–19:59 ${EASTERN_TZ}`,
    };
  }

  return {
    inWindow: false,
    slot: null,
    slotDate,
    detail: `Outside send windows (now ${local.toFormat("HH:mm:ss")} ${EASTERN_TZ})`,
  };
}

export function nowEastern(): DateTime {
  return DateTime.now().setZone(EASTERN_TZ);
}

/** Stable id for deduplication: one send per calendar day per slot in Eastern. */
export function buildSlotKey(slotDate: string, slot: SendSlot): string {
  return `${slotDate}-${slot}`;
}
