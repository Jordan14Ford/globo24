/**
 * Phase 3 — optional **slice** mode: run search → intel → editor (→ delivery via `npm run send`)
 * for a subset of topics (faster iteration, lower RSS/API load).
 *
 * @see docs/PHASE3_SLICE.md
 */
import { TOPICS, type TopicFeedConfig } from "../../config/topicFeeds";
import type { TopicId } from "../../types/pipeline";

const ALL_TOPIC_IDS: TopicId[] = ["tech", "geopolitics", "macro", "economics"];

function truthySliceFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** When true, only topics from `getSliceTopicIds()` participate in search + curation. */
export function isPipelineSliceMode(): boolean {
  return truthySliceFlag(process.env.PIPELINE_SLICE);
}

/**
 * Topic ids to include in slice mode (order follows `config/topicFeeds` / `TOPICS`).
 * Default when `PIPELINE_SLICE_TOPICS` is unset: `["tech"]` (single-topic “one search” path).
 */
export function getSliceTopicIds(): TopicId[] {
  const raw = process.env.PIPELINE_SLICE_TOPICS?.trim();
  if (!raw) {
    return ["tech"];
  }
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: TopicId[] = [];
  const seen = new Set<TopicId>();
  for (const p of parts) {
    if (!ALL_TOPIC_IDS.includes(p as TopicId)) {
      console.warn(`[pipeline] PIPELINE_SLICE_TOPICS: ignoring unknown topic "${p}"`);
      continue;
    }
    const id = p as TopicId;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length === 0) {
    console.warn("[pipeline] PIPELINE_SLICE_TOPICS had no valid ids — defaulting to tech");
    return ["tech"];
  }
  return out;
}

/** Topic feed configs for this run (full list or slice-filtered, canonical order). */
export function getTopicConfigsForPipelineRun(): TopicFeedConfig[] {
  if (!isPipelineSliceMode()) {
    return TOPICS;
  }
  const want = new Set(getSliceTopicIds());
  const filtered = TOPICS.filter((t) => want.has(t.id));
  if (filtered.length === 0) {
    console.warn("[pipeline] Slice produced no topics — falling back to full TOPICS");
    return TOPICS;
  }
  return filtered;
}
