/**
 * Load Reddit + earnings + optional review for the bottom of the digest.
 */
import { runDigestBottomReviewAgent } from "../../agents/digestBottomReviewAgent";
import { runEarningsCallsAgent } from "../../agents/earningsCallsAgent";
import { runRedditDigestAgent } from "../../agents/redditDigestAgent";
import type { ResolvedAgentRegistry } from "../agents/registry";
import { isAgentEnabled } from "../agents/registry";
import type {
  DigestBottomFlags,
  DigestBottomPayload,
  EarningsCallsSection,
  EarningsDigestSection,
} from "../../types/pipeline";
import { fetchEarningsDigestSection } from "./fetchEarningsWeek";

export function digestBottomEnabled(): boolean {
  const v = (process.env.DIGEST_BOTTOM_SECTIONS ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

function emptyEarnings(): EarningsDigestSection {
  return {
    weekLabel: "",
    rows: [],
    calendarUrl:
      process.env.EARNINGS_CALENDAR_URL?.trim() || "https://finance.yahoo.com/calendar/earnings",
  };
}

export async function buildDigestBottomPayload(registry: ResolvedAgentRegistry): Promise<DigestBottomPayload> {
  const flags: DigestBottomFlags = {
    showReddit: isAgentEnabled(registry, "supplement.reddit"),
    showEarningsWeekTable: isAgentEnabled(registry, "supplement.earnings_week"),
    showEarningsCallHubs: isAgentEnabled(registry, "supplement.earnings_calls"),
    showBottomReview: isAgentEnabled(registry, "supplement.bottom_review"),
  };

  let earnings: EarningsDigestSection = emptyEarnings();
  if (flags.showEarningsWeekTable || flags.showEarningsCallHubs) {
    earnings = await fetchEarningsDigestSection();
  }

  const reddit = flags.showReddit ? await runRedditDigestAgent() : [];

  let earningsCalls: EarningsCallsSection | undefined;
  if (flags.showEarningsCallHubs && earnings.rows.length > 0) {
    earningsCalls = await runEarningsCallsAgent(earnings);
  }

  const base: Omit<DigestBottomPayload, "supplementReview"> = {
    reddit,
    earnings,
    earningsCalls,
    flags,
  };

  const supplementReview = flags.showBottomReview ? await runDigestBottomReviewAgent(base) : undefined;

  return { ...base, supplementReview };
}
