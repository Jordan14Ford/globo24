import type { RegionConfig } from "../config/sources";
import { MAX_CANDIDATES_PER_REGION } from "../config/sources";
import type { NormalizedArticle, RegionalAgentResult } from "../types/pipeline";
import { dedupeKey, extractRssImage, normalizeLink, sharedParser } from "./rssUtil";

function log(regionId: string, msg: string, extra?: unknown) {
  const prefix = `[region:${regionId}]`;
  if (extra !== undefined) console.log(prefix, msg, extra);
  else console.log(prefix, msg);
}

/**
 * Strict allowlist: hostname must match or be subdomain of an allowed domain.
 */
export function isHostnameAllowed(hostname: string, allowedDomains: string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return allowedDomains.some((d) => {
    const dom = d.toLowerCase().replace(/^www\./, "");
    return host === dom || host.endsWith(`.${dom}`);
  });
}

export function isArticleUrlAllowed(articleUrl: string, allowedDomains: string[]): boolean {
  try {
    const { hostname } = new URL(articleUrl);
    return isHostnameAllowed(hostname, allowedDomains);
  } catch {
    return false;
  }
}

/**
 * Fetch all feeds for a region, normalize, domain-filter, dedupe.
 */
export async function runRegionalAgent(config: RegionConfig): Promise<RegionalAgentResult> {
  const errors: string[] = [];
  const raw: NormalizedArticle[] = [];

  for (const feed of config.feeds) {
    try {
      const parsed = await sharedParser.parseURL(feed.url);
      const items = parsed.items ?? [];
      log(config.id, `Fetched ${items.length} items from ${feed.name}`);

      for (const item of items) {
        const link = normalizeLink(item.link ?? item.guid);
        if (!link) continue;
        if (!isArticleUrlAllowed(link, config.allowedDomains)) {
          log(config.id, `Dropped (domain): ${link.slice(0, 80)}…`);
          continue;
        }

        const domain = new URL(link).hostname;
        const imageUrl = extractRssImage(item);
        raw.push({
          title: (item.title ?? "Untitled").trim(),
          link,
          summary: (item.contentSnippet ?? item.summary ?? "").slice(0, 2000),
          publishedAt: item.pubDate ?? item.isoDate ?? null,
          sourceFeedName: feed.name,
          domain,
          ...(imageUrl ? { imageUrl } : {}),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${feed.name}: ${msg}`);
      log(config.id, `RSS error for ${feed.name}`, msg);
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

  const capped = deduped.slice(0, MAX_CANDIDATES_PER_REGION);
  log(config.id, `Normalized ${capped.length} unique allowlisted articles (cap ${MAX_CANDIDATES_PER_REGION})`);

  return {
    regionId: config.id,
    regionName: config.name,
    articles: capped,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}
