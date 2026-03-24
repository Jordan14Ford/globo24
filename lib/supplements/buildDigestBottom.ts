/**
 * Load Reddit hot + earnings block for the bottom of the digest.
 */
import type { DigestBottomPayload } from "../../types/pipeline";
import { fetchRedditDigestSubsections } from "./fetchRedditHot";
import { fetchEarningsDigestSection } from "./fetchEarningsWeek";

export function digestBottomEnabled(): boolean {
  const v = (process.env.DIGEST_BOTTOM_SECTIONS ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

export async function buildDigestBottomPayload(): Promise<DigestBottomPayload> {
  const [reddit, earnings] = await Promise.all([
    fetchRedditDigestSubsections(),
    fetchEarningsDigestSection(),
  ]);
  return { reddit, earnings };
}
