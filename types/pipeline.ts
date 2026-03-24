/**
 * **Shared types for the news pipeline**
 *
 * - **Topic mode (default):** `TopicAgentResult` (search) → `MasterCuratedOutput` (review) → email compile.
 * - **Regional mode (legacy):** `RegionalAgentResult` → `RankedRegionalResult` → `RegionalPipelineOutput`.
 *
 * `NormalizedArticle` is the row shape for every ingested story after RSS normalization.
 *
 * @see docs/ARCHITECTURE.md
 * Scheduling / orchestration types: [`types/schedule.ts`](./schedule.ts)
 * Run history (Phase 4): [`types/run.ts`](./run.ts)
 * Agent registry (Phase 5): [`types/agent.ts`](./agent.ts)
 * Admin UI settings (Phase 6): [`types/admin.ts`](./admin.ts)
 */

export interface NormalizedArticle {
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  sourceFeedName: string;
  domain: string;
  /** From RSS enclosure / content image when present; otherwise digest uses a stock fallback. */
  imageUrl?: string;
}

/** --- Regional (legacy) pipeline --- */

export interface RegionalAgentResult {
  regionId: string;
  regionName: string;
  articles: NormalizedArticle[];
  errors: string[];
  fetchedAt: string;
}

export interface RankedRegionalResult {
  regionId: string;
  regionName: string;
  topStories: NormalizedArticle[];
  rankedBy: "openai" | "keyword_fallback";
  error?: string;
}

export interface RegionalPipelineOutput {
  generatedAt: string;
  regions: RankedRegionalResult[];
}

/** @deprecated Use RegionalPipelineOutput — alias for legacy imports */
export type PipelineOutput = RegionalPipelineOutput;

/** --- Topic + master curator pipeline --- */

export type TopicId = "tech" | "geopolitics" | "macro" | "economics";

export interface TopicAgentResult {
  topicId: TopicId;
  topicLabel: string;
  articles: NormalizedArticle[];
  errors: string[];
  fetchedAt: string;
}

export type CuratedBy = "openai" | "keyword_fallback";

/** Reddit “hot” row for the bottom-of-email supplement block. */
export interface RedditDigestPost {
  title: string;
  link: string;
}

export interface RedditDigestSubsection {
  label: string;
  subreddit: string;
  posts: RedditDigestPost[];
  error?: string;
}

export interface EarningsRow {
  symbol: string;
  companyName: string;
  date: string;
  timeLabel?: string;
}

/** This week’s earnings + outbound links (calendar, optional YouTube). */
export interface EarningsDigestSection {
  weekLabel: string;
  rows: EarningsRow[];
  calendarUrl: string;
  youtubeUrl?: string;
  fetchError?: string;
}

export interface DigestBottomPayload {
  reddit: RedditDigestSubsection[];
  earnings: EarningsDigestSection;
}

export interface MasterCuratedOutput {
  generatedAt: string;
  sections: Record<TopicId, NormalizedArticle[]>;
  curatedBy: CuratedBy;
  masterNotes?: string;
  error?: string;
  /** Reddit hot + earnings week — rendered at the bottom of the HTML/text digest when present. */
  digestBottom?: DigestBottomPayload;
}
