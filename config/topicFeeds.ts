/**
 * **Search configuration — Agent 1 (topic mode)**
 *
 * Defines the four pillars (`TOPICS`), each with:
 * - A **Google News RSS** search URL (broad query → many outlets through Google’s feed).
 * - Optional **direct publisher** RSS supplements (BBC + ZeroHedge, Naked Capitalism, Bloomberg, CNBC).
 *
 * `TOPIC_ALLOWED_HOSTS` restricts which link hostnames are kept (policy: no arbitrary domains).
 * Caps: `MAX_CANDIDATES_PER_TOPIC`, `TOP_STORIES_PER_TOPIC` (used by review agent).
 *
 * @see docs/ARCHITECTURE.md
 */

import type { TopicId } from "../types/pipeline";

export interface TopicFeedConfig {
  id: TopicId;
  /** Section title in email */
  label: string;
  /** Primary Google News RSS search URL (US English) */
  googleNewsRssUrl: string;
  /** Optional extra RSS URLs (e.g. BBC section) */
  supplementalFeeds?: { url: string; name: string }[];
}

/** Build Google News RSS URL from a search query. */
function gnUrl(query: string): string {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

/** Shared direct-publisher feeds (in addition to Google News per topic). */
const SUPPLEMENTAL_PUBLISHER_FEEDS: { url: string; name: string }[] = [
  { url: "https://cms.zerohedge.com/fullrss2.xml", name: "ZeroHedge" },
  { url: "https://www.nakedcapitalism.com/feed", name: "Naked Capitalism" },
  { url: "https://feeds.bloomberg.com/markets/news.rss", name: "Bloomberg Markets" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", name: "CNBC Top News" },
];

export const TOPICS: TopicFeedConfig[] = [
  {
    id: "tech",
    label: "Tech",
    googleNewsRssUrl: gnUrl(
      "technology OR artificial intelligence OR semiconductor OR software OR cybersecurity"
    ),
    supplementalFeeds: [
      ...SUPPLEMENTAL_PUBLISHER_FEEDS,
      { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", name: "BBC Technology" },
    ],
  },
  {
    id: "geopolitics",
    label: "Geopolitics",
    googleNewsRssUrl: gnUrl(
      "geopolitics OR diplomacy OR sanctions OR NATO OR conflict OR elections foreign policy"
    ),
    supplementalFeeds: [
      ...SUPPLEMENTAL_PUBLISHER_FEEDS,
      { url: "https://feeds.bbci.co.uk/news/world/rss.xml", name: "BBC World" },
    ],
  },
  {
    id: "macro",
    label: "Macro trends",
    googleNewsRssUrl: gnUrl(
      "central bank OR interest rates OR inflation OR Federal Reserve OR ECB OR bond yields OR FX OR currency markets"
    ),
    supplementalFeeds: [
      ...SUPPLEMENTAL_PUBLISHER_FEEDS,
      { url: "https://feeds.bbci.co.uk/news/business/rss.xml", name: "BBC Business" },
    ],
  },
  {
    id: "economics",
    label: "Economics",
    googleNewsRssUrl: gnUrl(
      "economy OR GDP OR recession OR unemployment OR trade OR tariffs OR IMF OR jobs report"
    ),
    supplementalFeeds: [
      ...SUPPLEMENTAL_PUBLISHER_FEEDS,
      { url: "https://feeds.bbci.co.uk/news/business/economy/rss.xml", name: "BBC Economy" },
    ],
  },
];

/** Hostnames allowed for article links (Google News + supplements). */
export const TOPIC_ALLOWED_HOSTS = new Set([
  "news.google.com",
  "www.news.google.com",
  "bbc.co.uk",
  "www.bbc.co.uk",
  "bbc.com",
  "www.bbc.com",
  "zerohedge.com",
  "www.zerohedge.com",
  "nakedcapitalism.com",
  "www.nakedcapitalism.com",
  "bloomberg.com",
  "www.bloomberg.com",
  "cnbc.com",
  "www.cnbc.com",
]);

export const MAX_CANDIDATES_PER_TOPIC = Number(process.env.MAX_CANDIDATES_PER_TOPIC ?? 80);
export const TOP_STORIES_PER_TOPIC = Number(process.env.TOP_STORIES_PER_TOPIC ?? 10);
