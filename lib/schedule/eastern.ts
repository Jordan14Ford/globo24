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
 * Fixed editorial send windows. The workflow can trigger several times inside each window,
 * while dedupe (`slotKey` per calendar day + slot) still guarantees at most one send each.
 *
 * @param _windowMinutes Kept for API compatibility; not used (fixed ranges below).
 */
export function checkSendWindow(dt: DateTime, _windowMinutes: number = DEFAULT_WINDOW_MINUTES): WindowCheck {
  const local = dt.setZone(EASTERN_TZ);
  const hour = local.hour;
  const slotDate = local.toFormat("yyyy-MM-dd");

  // Morning edition target: 09:00–10:00 ET.
  if (hour >= 9 && hour < 10) {
    return {
      inWindow: true,
      slot: "morning",
      slotDate,
      detail: `Morning window 09:00-10:00 ${EASTERN_TZ}`,
    };
  }

  // Evening edition target: 16:00–18:00 ET.
  const inEvening = hour >= 16 && hour < 18;

  if (inEvening) {
    return {
      inWindow: true,
      slot: "evening",
      slotDate,
      detail: `Evening window 16:00-18:00 ${EASTERN_TZ}`,
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
