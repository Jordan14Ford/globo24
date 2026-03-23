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
 */
export function checkSendWindow(
  dt: DateTime,
  windowMinutes: number = DEFAULT_WINDOW_MINUTES
): WindowCheck {
  const local = dt.setZone(EASTERN_TZ);
  const hour = local.hour;
  const minute = local.minute;
  const slotDate = local.toFormat("yyyy-MM-dd");

  if (hour === 9 && minute >= 0 && minute <= windowMinutes) {
    return {
      inWindow: true,
      slot: "morning",
      slotDate,
      detail: `Morning window 09:00–09:${String(windowMinutes).padStart(2, "0")} ${EASTERN_TZ}`,
    };
  }

  const eveningStartMinute = 30;
  if (
    hour === 17 &&
    minute >= eveningStartMinute &&
    minute <= eveningStartMinute + windowMinutes
  ) {
    return {
      inWindow: true,
      slot: "evening",
      slotDate,
      detail: `Evening window 17:30–17:${String(eveningStartMinute + windowMinutes).padStart(2, "0")} ${EASTERN_TZ}`,
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
