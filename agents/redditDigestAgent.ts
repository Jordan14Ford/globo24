/**
 * **Supplement agent — Reddit**
 *
 * Pulls daily top posts per configured subreddit and prefers titles that match
 * macro / markets / tech relevance keywords (see `config/redditRelevance.ts`).
 */
import { REDDIT_RELEVANCE_KEYWORDS } from "../config/redditRelevance";
import { REDDIGEST_SUBREDDITS } from "../config/redditDigest";
import { fetchSubreddit } from "../lib/supplements/fetchRedditHot";
import type { RedditDigestPost, RedditDigestSubsection } from "../types/pipeline";

function postsPerSub(): number {
  const n = Number(process.env.REDDIT_POSTS_PER_SUB ?? "3");
  return Number.isFinite(n) && n >= 1 && n <= 15 ? Math.floor(n) : 3;
}

function relevanceScore(title: string): number {
  const t = title.toLowerCase();
  return REDDIT_RELEVANCE_KEYWORDS.reduce(
    (score, k) => score + (t.includes(k.toLowerCase()) ? 1 : 0),
    0
  );
}

function rankAndFilter(posts: RedditDigestPost[], cap: number): RedditDigestPost[] {
  const scored = posts.map((p) => ({
    p,
    rel: relevanceScore(p.title),
    score: p.score ?? 0,
    comments: p.commentCount ?? 0,
    recent:
      p.createdUtc && Number.isFinite(p.createdUtc)
        ? Math.max(0, 48 - (Date.now() / 1000 - p.createdUtc) / 3600) / 48
        : 0,
  }));
  scored.sort((a, b) => {
    if (b.rel !== a.rel) return b.rel - a.rel;
    const aSocial = Math.log10(a.score + 1) + Math.log10(a.comments + 1) * 0.5 + a.recent;
    const bSocial = Math.log10(b.score + 1) + Math.log10(b.comments + 1) * 0.5 + b.recent;
    return bSocial - aSocial;
  });
  const matched = scored.filter((x) => x.rel > 0).map((x) => x.p);
  if (matched.length >= Math.min(2, cap)) {
    return matched.slice(0, cap);
  }
  // Fallback: keep top Reddit posts even if keywords miss (community still “hot”)
  return scored.slice(0, cap).map((x) => x.p);
}

export async function runRedditDigestAgent(): Promise<RedditDigestSubsection[]> {
  const cap = postsPerSub();
  const results: RedditDigestSubsection[] = [];

  for (const { subreddit, label } of REDDIGEST_SUBREDDITS) {
    const { posts, error } = await fetchSubreddit(subreddit, Math.max(cap * 2, 10));
    const filtered = error ? posts : rankAndFilter(posts, cap);
    results.push({
      label,
      subreddit,
      posts: filtered,
      ...(error ? { error } : {}),
    });
    await new Promise((r) => setTimeout(r, 800));
  }

  return results;
}
