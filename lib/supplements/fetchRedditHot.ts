/**
 * Fetch subreddit posts via Reddit listing JSON endpoints.
 * Combines hot + top/day by default, then dedupes so the digest is less brittle than RSS
 * and less dependent on a single Reddit ranking surface.
 */
import { normalizeLink, sharedParser } from "../../agents/rssUtil";
import type { RedditDigestPost } from "../../types/pipeline";

const USER_AGENT =
  process.env.REDDIT_USER_AGENT?.trim() || "GloboNews24/1.0 (digest bot; reddit.com/json)";

let oauthTokenCache: { token: string; expiresAtMs: number } | null = null;

interface ListingSpec {
  key: string;
  path: string;
}

interface RedditChild {
  data: {
    title?: string;
    url?: string;
    permalink?: string;
    score?: number;
    num_comments?: number;
    created_utc?: number;
    is_self?: boolean;
    over_18?: boolean;
    stickied?: boolean;
  };
}

interface RedditResponse {
  data?: {
    children?: RedditChild[];
  };
}

interface RedditTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface RedditRssItem {
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
}

function parseListingSpecs(): ListingSpec[] {
  const raw = process.env.REDDIT_SORTS?.trim() || "hot,top-day";
  const specs: ListingSpec[] = [];
  for (const token of raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (token === "hot") specs.push({ key: "hot", path: "hot.json" });
    else if (token === "top-day") specs.push({ key: "top-day", path: "top.json?t=day" });
    else if (token === "top-week") specs.push({ key: "top-week", path: "top.json?t=week" });
    else if (token === "rising") specs.push({ key: "rising", path: "rising.json" });
  }
  return specs.length > 0 ? specs : [{ key: "hot", path: "hot.json" }];
}

function rssPathForSpec(spec: ListingSpec): string {
  if (spec.key === "top-day") return "top/.rss?t=day";
  if (spec.key === "top-week") return "top/.rss?t=week";
  if (spec.key === "rising") return "rising/.rss";
  return "hot/.rss";
}

function threadUrl(permalink?: string): string {
  if (!permalink) return "";
  return `https://www.reddit.com${permalink}`;
}

function normalizeRedditUrl(raw: string | undefined): string | null {
  const normalized = normalizeLink(raw);
  if (!normalized) return null;
  return normalized.replace("https://old.reddit.com/", "https://www.reddit.com/");
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hrefForLabel(content: string | undefined, label: "[link]" | "[comments]"): string | null {
  if (!content) return null;
  const decoded = decodeBasicEntities(content);
  const re = new RegExp(`<a\\s+href=["']([^"']+)["'][^>]*>\\s*${escapeRe(label)}\\s*<\\/a>`, "i");
  const match = decoded.match(re);
  return normalizeRedditUrl(match?.[1]);
}

async function getRedditOAuthToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (oauthTokenCache && oauthTokenCache.expiresAtMs > now + 60_000) {
    return oauthTokenCache.token;
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RedditTokenResponse;
    if (!data.access_token) return null;
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
    oauthTokenCache = {
      token: data.access_token,
      expiresAtMs: now + expiresIn * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

function normalizePost(child: RedditChild, listing: string): RedditDigestPost | null {
  const d = child.data;
  if (d.over_18 || d.stickied) return null;

  const title = (d.title ?? "").replace(/\s+/g, " ").trim();
  const redditThreadUrl = threadUrl(d.permalink);
  if (!title || !redditThreadUrl) return null;

  const link =
    d.url && !d.is_self && d.url.startsWith("http") && !d.url.includes("reddit.com")
      ? d.url
      : redditThreadUrl;

  return {
    title,
    link,
    redditThreadUrl,
    score: typeof d.score === "number" ? d.score : undefined,
    commentCount: typeof d.num_comments === "number" ? d.num_comments : undefined,
    createdUtc: typeof d.created_utc === "number" ? d.created_utc : undefined,
    listings: [listing],
  };
}

async function fetchListing(
  subreddit: string,
  spec: ListingSpec,
  limit: number
): Promise<{ posts: RedditDigestPost[]; error?: string }> {
  const joiner = spec.path.includes("?") ? "&" : "?";
  const token = await getRedditOAuthToken();
  const host = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const url = `${host}/r/${subreddit}/${spec.path}${joiner}limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    return { posts: [], error: `${spec.key}: HTTP ${res.status}` };
  }
  const data = (await res.json()) as RedditResponse;
  const children = data?.data?.children ?? [];
  return {
    posts: children
      .map((child) => normalizePost(child, spec.key))
      .filter((post): post is RedditDigestPost => post !== null),
  };
}

async function fetchRssListing(
  subreddit: string,
  spec: ListingSpec,
  limit: number
): Promise<{ posts: RedditDigestPost[]; error?: string }> {
  try {
    const path = rssPathForSpec(spec);
    const joiner = path.includes("?") ? "&" : "?";
    const url = `https://old.reddit.com/r/${subreddit}/${path}${joiner}limit=${limit}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml, application/rss+xml, text/xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { posts: [], error: `rss-${spec.key}: HTTP ${res.status}` };
    }
    const feed = await sharedParser.parseString(await res.text());
    const posts: (RedditDigestPost | null)[] = (feed.items as RedditRssItem[]).map((item) => {
      const title = (item.title ?? "").replace(/\s+/g, " ").trim();
      const redditThreadUrl =
        hrefForLabel(item.content, "[comments]") ??
        normalizeRedditUrl(item.link) ??
        `https://www.reddit.com/r/${subreddit}/`;
      const linked = hrefForLabel(item.content, "[link]");
      const link =
        linked && !linked.includes("reddit.com")
          ? linked
          : redditThreadUrl;
      const createdUtc = item.isoDate || item.pubDate
        ? Math.floor(new Date(item.isoDate ?? item.pubDate ?? "").getTime() / 1000)
        : undefined;
      if (!title || !redditThreadUrl) return null;
      const post: RedditDigestPost = {
        title,
        link,
        redditThreadUrl,
        createdUtc: Number.isFinite(createdUtc) ? createdUtc : undefined,
        listings: [`rss-${spec.key}`],
      };
      return post;
    });
    return {
      posts: posts.filter((post): post is RedditDigestPost => post !== null),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { posts: [], error: `rss-${spec.key}: ${msg}` };
  }
}

function mergePosts(listings: RedditDigestPost[][]): RedditDigestPost[] {
  const byThread = new Map<string, RedditDigestPost>();
  for (const posts of listings) {
    for (const post of posts) {
      const existing = byThread.get(post.redditThreadUrl);
      if (!existing) {
        byThread.set(post.redditThreadUrl, post);
        continue;
      }
      byThread.set(post.redditThreadUrl, {
        ...existing,
        score: Math.max(existing.score ?? 0, post.score ?? 0),
        commentCount: Math.max(existing.commentCount ?? 0, post.commentCount ?? 0),
        createdUtc: Math.max(existing.createdUtc ?? 0, post.createdUtc ?? 0) || undefined,
        listings: Array.from(new Set([...(existing.listings ?? []), ...(post.listings ?? [])])),
      });
    }
  }
  return Array.from(byThread.values());
}

export async function fetchSubreddit(
  subreddit: string,
  cap: number
): Promise<{ posts: RedditDigestPost[]; error?: string }> {
  const specs = parseListingSpecs();
  const limit = Math.min(Math.max(cap, 10), 40);
  const fetched: RedditDigestPost[][] = [];
  const errors: string[] = [];

  try {
    for (const spec of specs) {
      const result = await fetchListing(subreddit, spec, limit);
      if (result.error) errors.push(result.error);
      fetched.push(result.posts);
    }
    let posts = mergePosts(fetched);
    if (posts.length > 0) return { posts };

    const rssFetched: RedditDigestPost[][] = [];
    for (const spec of specs) {
      const result = await fetchRssListing(subreddit, spec, limit);
      if (result.error) errors.push(result.error);
      rssFetched.push(result.posts);
    }
    posts = mergePosts(rssFetched);
    return {
      posts,
      ...(posts.length === 0 && errors.length > 0 ? { error: errors.join("; ") } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { posts: [], error: msg };
  }
}
