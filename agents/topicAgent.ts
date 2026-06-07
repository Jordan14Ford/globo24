/**
 * **Agent 1 — Search (per topic)**
 *
 * One “topic agent” run = fetch all configured RSS feeds for a single pillar (e.g. tech),
 * keep only allowlisted hostnames, dedupe by URL, then cap to `MAX_CANDIDATES_PER_TOPIC`.
 * Does not rank for “importance”; it only discovers and normalizes. The **review agent**
 * (`masterAgent`) runs afterward on the combined candidate lists.
 *
 * @see docs/ARCHITECTURE.md
 */
import type { TopicFeedConfig } from "../config/topicFeeds";
import {
  MAX_CANDIDATES_PER_TOPIC,
  TOPIC_ALLOWED_HOSTS,
} from "../config/topicFeeds";
import { dedupeKey, extractRssImage, normalizeLink, sharedParser } from "./rssUtil";
import type { NormalizedArticle, TopicAgentResult } from "../types/pipeline";

function log(topicId: string, msg: string, extra?: unknown) {
  const prefix = `[agent:${topicId}]`;
  if (extra !== undefined) console.log(prefix, msg, extra);
  else console.log(prefix, msg);
}

const allowedList = [...TOPIC_ALLOWED_HOSTS];

function isHostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return allowedList.some((d) => {
    const dom = d.toLowerCase().replace(/^www\./, "");
    return host === dom || host.endsWith(`.${dom}`);
  });
}

function isArticleAllowed(url: string): boolean {
  try {
    return isHostAllowed(new URL(url).hostname);
  } catch {
    return false;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesTopicTerms(text: string, terms: string[]): boolean {
  return terms.some((term) => {
    const normalized = term.trim();
    if (!normalized) return false;
    if (normalized.length <= 3) {
      return new RegExp(`\\b${escapeRe(normalized)}\\b`, "i").test(text);
    }
    return text.toLowerCase().includes(normalized.toLowerCase());
  });
}

/**
 * Fetch Google News RSS + optional supplements (e.g. BBC), normalize, allowlist hosts, dedupe, cap.
 */
export async function runTopicAgent(config: TopicFeedConfig): Promise<TopicAgentResult> {
  const errors: string[] = [];
  const raw: NormalizedArticle[] = [];

  const feeds: { url: string; name: string; topicScoped: boolean }[] = [
    { url: config.googleNewsRssUrl, name: "Google News (topic)", topicScoped: true },
    ...(config.supplementalFeeds ?? []).map((feed) => ({ ...feed, topicScoped: false })),
  ];

  for (const feed of feeds) {
    try {
      const parsed = await sharedParser.parseURL(feed.url);
      const items = parsed.items ?? [];
      log(config.id, `Fetched ${items.length} items from ${feed.name}`);
      let relevanceDropped = 0;

      for (const item of items) {
        const title = (item.title ?? "Untitled").trim();
        const summary = (item.contentSnippet ?? item.summary ?? "").slice(0, 2000);
        if (!feed.topicScoped && !matchesTopicTerms(`${title} ${summary}`, config.relevanceTerms)) {
          relevanceDropped++;
          continue;
        }

        const link = normalizeLink(item.link ?? item.guid);
        if (!link) continue;
        if (!isArticleAllowed(link)) {
          log(config.id, `Dropped host: ${link.slice(0, 72)}…`);
          continue;
        }

        const domain = new URL(link).hostname;
        const imageUrl = extractRssImage(item);
        raw.push({
          title,
          link,
          summary,
          publishedAt: item.pubDate ?? item.isoDate ?? null,
          sourceFeedName: feed.name,
          domain,
          ...(imageUrl ? { imageUrl } : {}),
        });
      }
      if (relevanceDropped > 0) {
        log(config.id, `Filtered ${relevanceDropped} off-topic items from ${feed.name}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${feed.name}: ${msg}`);
      log(config.id, `RSS error: ${feed.name}`, msg);
    }
  }

  const seen = new Set<string>();
  const deduped: NormalizedArticle[] = [];
  for (const a of raw) {
    const k = dedupeKey(a.link);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(a);
  }

  const capped = deduped.slice(0, MAX_CANDIDATES_PER_TOPIC);
  log(config.id, `Ready ${capped.length} articles (cap ${MAX_CANDIDATES_PER_TOPIC})`);

  return {
    topicId: config.id,
    topicLabel: config.label,
    articles: capped,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}
