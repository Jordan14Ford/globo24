/**
 * Fetch top posts per subreddit via Reddit's public JSON API (no OAuth).
 * Uses /top.json?t=day which is more reliable than old.reddit.com RSS for server-side fetches.
 */
import type { RedditDigestSubsection } from "../../types/pipeline";
import { REDDIGEST_SUBREDDITS } from "../../config/redditDigest";

const USER_AGENT = "regional-news-agent/0.1 (automated news digest)";

function postsPerSub(): number {
  const n = Number(process.env.REDDIT_POSTS_PER_SUB ?? "6");
  return Number.isFinite(n) && n >= 1 && n <= 15 ? Math.floor(n) : 6;
}

interface RedditChild {
  data: {
    title?: string;
    url?: string;
    permalink?: string;
    score?: number;
    is_self?: boolean;
  };
}

interface RedditResponse {
  data?: {
    children?: RedditChild[];
  };
}

async function fetchSubreddit(
  subreddit: string,
  cap: number
): Promise<{ posts: { title: string; link: string }[]; error?: string }> {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?t=day&limit=${cap}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { posts: [], error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as RedditResponse;
    const children = data?.data?.children ?? [];
    const posts = children.slice(0, cap).map((child) => {
      const d = child.data;
      const title = (d.title ?? "Untitled").replace(/\s+/g, " ").trim();
      const redditLink = `https://www.reddit.com${d.permalink ?? ""}`;
      // Use external URL for link posts; fall back to the Reddit thread
      const link =
        d.url && !d.is_self && d.url.startsWith("http") && !d.url.includes("reddit.com")
          ? d.url
          : redditLink;
      return { title, link };
    });
    return { posts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { posts: [], error: msg };
  }
}

export async function fetchRedditDigestSubsections(): Promise<RedditDigestSubsection[]> {
  const cap = postsPerSub();
  const results: RedditDigestSubsection[] = [];

  for (const { subreddit, label } of REDDIGEST_SUBREDDITS) {
    const { posts, error } = await fetchSubreddit(subreddit, cap);
    results.push({ label, subreddit, posts, ...(error ? { error } : {}) });
    // Polite delay between requests to avoid rate-limiting
    await new Promise((r) => setTimeout(r, 800));
  }

  return results;
}
