/**
 * **Shared RSS + URL utilities**
 *
 * - `sharedParser`: one `rss-parser` instance for all feeds (timeout + User-Agent).
 * - `normalizeLink` / `dedupeKey`: stable URLs for deduplication.
 * - `resolveGoogleNewsUrls`: optional post-curation pass on selected articles (Google often
 *   blocks true publisher URLs from server-side fetch; links still work in a browser).
 *
 * Used by **search** agents (`topicAgent`, `regionalAgent`) and the pipeline after review.
 */
import Parser from "rss-parser";
import type { Item } from "rss-parser";
import type { NormalizedArticle } from "../types/pipeline";

export const sharedParser = new Parser({
  timeout: 25000,
  headers: {
    "User-Agent": "GlobalNewsPipeline/1.0 (RSS; +https://github.com/)",
  },
});

export function normalizeLink(link: string | undefined): string | null {
  if (!link?.trim()) return null;
  try {
    const u = new URL(link.trim());
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function dedupeKey(link: string): string {
  return link.toLowerCase().replace(/\/$/, "");
}

/**
 * Best-effort image URL from RSS item (enclosure, itunes:image, or first &lt;img&gt; in content).
 */
export function extractRssImage(item: Item): string | undefined {
  const enc = item.enclosure;
  if (enc?.url?.trim()) {
    const t = (enc.type ?? "").toLowerCase();
    const u = enc.url.trim();
    if (t.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(u)) {
      return u;
    }
  }
  const any = item as Item & {
    itunes?: { image?: string; href?: string };
    "media:thumbnail"?: { $?: { url?: string } } | { url?: string };
  };
  const itunesImg = any.itunes?.image ?? any.itunes?.href;
  if (typeof itunesImg === "string" && /^https?:\/\//i.test(itunesImg)) return itunesImg;

  const thumb = any["media:thumbnail"];
  if (thumb && typeof thumb === "object") {
    const url =
      "$" in thumb && thumb.$?.url
        ? thumb.$.url
        : "url" in thumb && typeof (thumb as { url?: string }).url === "string"
          ? (thumb as { url: string }).url
          : undefined;
    if (url && /^https?:\/\//i.test(url)) return url;
  }

  const raw = item as Item & { "content:encoded"?: string };
  const blob = item.content ?? raw["content:encoded"] ?? "";
  if (typeof blob === "string") {
    const m = blob.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m?.[1] && /^https?:\/\//i.test(m[1])) return m[1];
  }
  return undefined;
}

/* ---------- Google News redirect URL resolution ---------- */

const GNEWS_ARTICLES = "news.google.com/rss/articles/";

function tryDecodeGnewsBase64(gnUrl: string): string | null {
  try {
    const idx = gnUrl.indexOf(GNEWS_ARTICLES);
    if (idx < 0) return null;
    let token = gnUrl.slice(idx + GNEWS_ARTICLES.length);
    const qIdx = token.indexOf("?");
    if (qIdx >= 0) token = token.slice(0, qIdx);

    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(b64, "base64").toString("binary");

    const match = decoded.match(/https?:\/\/[\x21-\x7e]+/);
    if (!match) return null;

    const candidate = match[0].replace(/[^\x20-\x7e]/g, "");
    const parsed = new URL(candidate);
    if (parsed.hostname.includes("google.com") || parsed.hostname.includes("google.")) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

async function resolveViaHttp(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(6000),
    });
    const final = resp.url;
    if (
      final &&
      final !== url &&
      !final.includes("consent.google") &&
      !final.includes("news.google.com")
    ) {
      return final;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Batch-resolve Google News redirect URLs to actual publisher URLs.
 * Tries base64 decode first (instant), then HTTP redirect as fallback.
 * Mutates articles in place.
 */
export async function resolveGoogleNewsUrls(
  articles: NormalizedArticle[],
  concurrency = 5,
): Promise<void> {
  const toResolve = articles.filter((a) => a.link.includes(GNEWS_ARTICLES));
  if (toResolve.length === 0) return;

  console.log(`[resolve] Resolving ${toResolve.length} Google News redirect URLs…`);
  let resolved = 0;
  const queue = [...toResolve];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const article = queue.shift();
      if (!article) break;

      const original = article.link;

      const decoded = tryDecodeGnewsBase64(original);
      if (decoded && decoded !== original) {
        article.link = decoded;
        try {
          article.domain = new URL(decoded).hostname;
        } catch { /* keep existing */ }
        resolved++;
        continue;
      }

      const httpResolved = await resolveViaHttp(original);
      if (httpResolved !== original) {
        article.link = httpResolved;
        try {
          article.domain = new URL(httpResolved).hostname;
        } catch { /* keep existing */ }
        resolved++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, toResolve.length) }, () => worker()),
  );
  console.log(`[resolve] Resolved ${resolved}/${toResolve.length} URLs`);
}
