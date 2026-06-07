/**
 * **Agent 2 — Review / curate**
 *
 * Takes the **search** outputs (`TopicAgentResult[]`) and produces the final story list per topic.
 *
 * - **With `OPENAI_API_KEY`:** one Chat Completions call with `response_format: json_object`;
 *   the model returns array indices into each topic’s candidate list (macro-relevant, dedupe).
 * - **Without a key or on API failure:** `fallbackCurate` scores with topic keywords, penalizes
 *   clickbait patterns, boosts recency, enforces max stories per publisher (from title suffix),
 *   and dedupes URLs across topics.
 *
 * This module does **not** fetch RSS; that is `topicAgent.ts`.
 *
 * @see docs/ARCHITECTURE.md
 */
import OpenAI from "openai";
import { MIN_STORIES_PER_TOPIC, TOP_STORIES_PER_TOPIC } from "../config/topicFeeds";
import type {
  CuratedBy,
  MasterCuratedOutput,
  NormalizedArticle,
  TopicAgentResult,
  TopicId,
} from "../types/pipeline";

const ALL_TOPIC_IDS: TopicId[] = ["tech", "geopolitics", "macro", "economics"];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normUrl(u: string): string {
  return u.toLowerCase().replace(/\/$/, "").split("?")[0];
}

const TOPIC_KEYWORDS: Record<TopicId, string[]> = {
  tech: [
    "ai",
    "artificial intelligence",
    "semiconductor",
    "software",
    "cyber",
    "cloud",
    "chip",
    "nvidia",
    "openai",
    "tech",
    "startup",
  ],
  geopolitics: [
    "nato",
    "sanction",
    "war",
    "diplomat",
    "election",
    "treaty",
    "summit",
    "military",
    "conflict",
    "embassy",
    "iran",
    "china",
    "russia",
    "ukraine",
  ],
  macro: [
    "fed",
    "ecb",
    "rates",
    "inflation",
    "cpi",
    "yield",
    "bond",
    "fx",
    "currency",
    "dollar",
    "yen",
    "euro",
    "central bank",
  ],
  economics: [
    "gdp",
    "recession",
    "jobs",
    "unemployment",
    "trade",
    "tariff",
    "imf",
    "economy",
    "growth",
    "deficit",
  ],
};

const NEGATIVE_PATTERNS: RegExp[] = [
  /\bstock to buy\b/i,
  /\bmillionaire/i,
  /\bfortune by \d{4}\b/i,
  /\bgenerational wealth\b/i,
  /\b\d+ reasons? why\b/i,
  /\bshould you (buy|sell|forget)\b/i,
  /\boutperforming\b/i,
  /\bultimate .* investment\b/i,
  /\bworth a fortune\b/i,
  /motley fool/i,
  /\bmy top stock\b/i,
  /\bcould be next\b/i,
  /\bquietly outperforming\b/i,
  /\bmy two cents\b/i,
  /\bguest column\b/i,
  /\bparody\b/i,
  /\bshould not fear\b/i,
  /\bteaches how to hear god\b/i,
];

const HARD_EXCLUDE_PATTERNS: RegExp[] = [
  /\bmy two cents\b/i,
  /\bguest column\b/i,
  /\bparody\b/i,
  /\bteaches how to hear god\b/i,
  /\bmotley fool\b/i,
  /\bbuy this\b/i,
  /\bstocks? that also pay dividends\b/i,
  /\bprediction:\b/i,
  /\bover the next \d+ years?\b/i,
  /\bprecision trading\b/i,
  /\brisk zones\b/i,
  /\bstocks? tumbling\b/i,
  /\bstock traders daily\b/i,
  /\bforeignpolicyjournal\.com\b/i,
];

const MARKET_IMPACT_KEYWORDS = [
  "earnings",
  "revenue",
  "profit",
  "margin",
  "stock",
  "shares",
  "market",
  "investor",
  "investment",
  "funding",
  "valuation",
  "acquisition",
  "merger",
  "ipo",
  "regulation",
  "policy",
  "law",
  "export",
  "tariff",
  "sanction",
  "supply chain",
  "manufacturing",
  "chip",
  "semiconductor",
  "data center",
  "cloud",
  "cybersecurity",
  "enterprise",
  "contract",
  "deal",
  "demand",
  "sales",
  "guidance",
  "forecast",
  "layoff",
  "jobs",
  "rate",
  "inflation",
  "yield",
  "bond",
  "currency",
  "oil",
];

const TRUSTED_PUBLISHERS = [
  "reuters",
  "bloomberg",
  "cnbc",
  "bbc",
  "associated press",
  "ap news",
  "financial times",
  "wall street journal",
  "new york times",
  "washington post",
  "fortune",
  "morningstar",
  "council on foreign relations",
  "c-span",
  "consilium.europa.eu",
];

const MAX_PER_DOMAIN_FALLBACK = 2;

function extractPublisher(title: string, domain: string): string {
  const dashIdx = title.lastIndexOf(" - ");
  if (dashIdx > 0 && dashIdx < title.length - 3) {
    return title.slice(dashIdx + 3).trim().toLowerCase();
  }
  return domain.toLowerCase().replace(/^www\./, "");
}

function keywordScoreForTopic(topicId: TopicId, text: string): number {
  const t = text.toLowerCase();
  const kws = TOPIC_KEYWORDS[topicId];
  let s = 0;
  for (const kw of kws) {
    const re = new RegExp(`\\b${escapeRe(kw)}\\b`, "i");
    if (re.test(t)) s += 1;
  }
  return s;
}

function keywordCount(text: string, keywords: string[]): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (t.includes(keyword.toLowerCase())) score++;
  }
  return score;
}

function trustedPublisherBoost(title: string, domain: string): number {
  const publisher = extractPublisher(title, domain);
  return TRUSTED_PUBLISHERS.some((trusted) => publisher.includes(trusted)) ? 2 : 0;
}

function negativePenalty(text: string): number {
  let p = 0;
  for (const re of NEGATIVE_PATTERNS) {
    if (re.test(text)) p += 2;
  }
  return p;
}

function isEligibleFallbackStory(
  topicId: TopicId,
  text: string,
  topicRelevance: number,
  marketImpact: number
): boolean {
  if (topicRelevance <= 0) return false;
  if (HARD_EXCLUDE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (topicId === "tech" || topicId === "economics") return marketImpact > 0;
  return true;
}

function titleTokens(title: string): Set<string> {
  const stop = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "for",
    "from",
    "in",
    "of",
    "on",
    "the",
    "to",
    "with",
  ]);
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stop.has(token))
  );
}

function isNearDuplicateTitle(candidate: NormalizedArticle, picked: NormalizedArticle[]): boolean {
  const a = titleTokens(candidate.title);
  if (a.size === 0) return false;
  return picked.some((article) => {
    const b = titleTokens(article.title);
    if (b.size === 0) return false;
    let overlap = 0;
    for (const token of a) {
      if (b.has(token)) overlap++;
    }
    const similarity = overlap / Math.min(a.size, b.size);
    const samePublisher =
      extractPublisher(candidate.title, candidate.domain) ===
      extractPublisher(article.title, article.domain);
    return similarity >= 0.65 || (samePublisher && similarity >= 0.4);
  });
}

function recencyBoost(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  try {
    const hours = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000;
    if (hours < 0 || isNaN(hours)) return 0;
    if (hours <= 6) return 2;
    if (hours <= 24) return 1;
    if (hours <= 48) return 0.5;
    return 0;
  } catch {
    return 0;
  }
}

/** Deterministic stand-in when OpenAI is unavailable: scored sort + diversity + cross-topic URL dedup. */
function fallbackCurate(results: TopicAgentResult[]): MasterCuratedOutput {
  const sections: Record<TopicId, NormalizedArticle[]> = {
    tech: [],
    geopolitics: [],
    macro: [],
    economics: [],
  };

  const globalSeen = new Set<string>();

  for (const tr of results) {
    const scored = tr.articles.map((a) => {
      const blob = `${a.title} ${a.summary}`;
      const relevance = keywordScoreForTopic(tr.topicId, blob);
      const marketImpact = keywordCount(blob, MARKET_IMPACT_KEYWORDS);
      return {
        a,
        relevance,
        eligible: isEligibleFallbackStory(tr.topicId, blob, relevance, marketImpact),
        score:
          relevance * 2 +
          marketImpact * 1.5 +
          trustedPublisherBoost(a.title, a.domain) -
          negativePenalty(blob) +
          recencyBoost(a.publishedAt) +
          (a.title.length > 40 ? 0.1 : 0),
      };
    });
    scored.sort((x, y) => y.score - x.score);

    const pubCount = new Map<string, number>();
    const picked: NormalizedArticle[] = [];
    for (const { a, eligible } of scored) {
      if (!eligible) continue;
      if (isNearDuplicateTitle(a, picked)) continue;
      const pub = extractPublisher(a.title, a.domain);
      const cnt = pubCount.get(pub) ?? 0;
      if (cnt >= MAX_PER_DOMAIN_FALLBACK) continue;
      const dedup = a.link.toLowerCase().replace(/\/$/, "");
      if (globalSeen.has(dedup)) continue;
      globalSeen.add(dedup);
      pubCount.set(pub, cnt + 1);
      picked.push(a);
      if (picked.length >= TOP_STORIES_PER_TOPIC) break;
    }

    sections[tr.topicId] = picked;
  }

  return {
    generatedAt: new Date().toISOString(),
    sections,
    curatedBy: "keyword_fallback",
    masterNotes:
      "Keyword selection with source-diversity cap, clickbait demotion, recency boost, and cross-topic dedup.",
  };
}

const systemPrompt = `You are the master editor for a global macro intelligence digest.
You receive candidate news articles grouped by topic: tech, geopolitics, macro trends, economics.
Tasks:
1) Within each topic, pick the BEST candidates for a senior macro reader (rates, FX, commodities, geopolitics, AI/industrial policy, trade).
2) Remove near-duplicates (same story reworded) within a topic.
3) Return at most N indices per topic (given in user JSON as maxPerTopic), referring to each topic's article array indices (0-based).
4) When there are enough distinct articles, include at least minPerTopic indices per topic (given in user JSON). If a topic has fewer candidates than minPerTopic, return as many distinct indices as exist.
5) Exclude parody, generic opinion, religion/soft-interest uses of technology terms, local booster stories, and items without financial-market, policy, industry, or macroeconomic consequence.
Output JSON only: { "selections": { "tech": number[], "geopolitics": number[], "macro": number[], "economics": number[] }, "notes": string }`;

/**
 * Run the review step: OpenAI JSON selection, or `fallbackCurate` on missing key / error.
 */
export async function runMasterAgent(
  topicResults: TopicAgentResult[],
  apiKey: string | undefined
): Promise<MasterCuratedOutput> {
  if (!apiKey?.trim()) {
    console.log("[master] No OPENAI_API_KEY — keyword fallback");
    return fallbackCurate(topicResults);
  }

  const payload: Record<
    string,
    { label: string; max: number; articles: { i: number; title: string; link: string; summary: string }[] }
  > = {};

  for (const tr of topicResults) {
    payload[tr.topicId] = {
      label: tr.topicLabel,
      max: TOP_STORIES_PER_TOPIC,
      articles: tr.articles.map((a, i) => ({
        i,
        title: a.title,
        link: a.link,
        summary: a.summary.slice(0, 400),
      })),
    };
  }

  const sliceMode = topicResults.length < 4;
  const sliceHint = sliceMode
    ? `SLICE MODE: only these topics have candidate articles: ${topicResults
        .map((t) => t.topicId)
        .join(", ")}. Return selections only for those topics (use [] for topics with no candidates).`
    : undefined;

  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MASTER_MODEL ?? "gpt-4o-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            maxPerTopic: TOP_STORIES_PER_TOPIC,
            minPerTopic: MIN_STORIES_PER_TOPIC,
            topics: payload,
            sliceMode,
            sliceHint,
          }),
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as {
      selections?: Partial<Record<TopicId, number[]>>;
      notes?: string;
    };

    const sections: Record<TopicId, NormalizedArticle[]> = {
      tech: [],
      geopolitics: [],
      macro: [],
      economics: [],
    };

    for (const tid of ALL_TOPIC_IDS) {
      const tr = topicResults.find((t) => t.topicId === tid);
      if (!tr) continue;
      const idxs = parsed.selections?.[tid] ?? [];
      const picked: NormalizedArticle[] = [];
      const used = new Set<number>();
      for (const ix of idxs) {
        if (typeof ix !== "number" || ix < 0 || ix >= tr.articles.length) continue;
        if (used.has(ix)) continue;
        used.add(ix);
        picked.push(tr.articles[ix]);
        if (picked.length >= TOP_STORIES_PER_TOPIC) break;
      }
      sections[tid] = picked;
    }

    const empty = ALL_TOPIC_IDS.every((id) => sections[id].length === 0);
    if (empty) {
      console.log("[master] OpenAI returned empty selections — keyword fallback");
      return { ...fallbackCurate(topicResults), error: "empty OpenAI selections" };
    }

    console.log("[master] Curated via OpenAI");
    return {
      generatedAt: new Date().toISOString(),
      sections,
      curatedBy: "openai" as CuratedBy,
      masterNotes: parsed.notes,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("[master] OpenAI error — keyword fallback", msg);
    return { ...fallbackCurate(topicResults), error: msg };
  }
}

/**
 * Ensures each topic present in `topicResults` has at least `MIN_STORIES_PER_TOPIC` articles
 * when enough unique URLs exist among candidates (respects `TOP_STORIES_PER_TOPIC` cap).
 * Used after cross-edition dedup in the pipeline.
 */
export function ensureMinimumStoriesPerTopic(
  master: MasterCuratedOutput,
  topicResults: TopicAgentResult[]
): MasterCuratedOutput {
  const min = MIN_STORIES_PER_TOPIC;
  const max = TOP_STORIES_PER_TOPIC;
  if (min <= 0 || topicResults.length === 0) return master;

  const sections: Record<TopicId, NormalizedArticle[]> = {
    tech: [...(master.sections.tech ?? [])],
    geopolitics: [...(master.sections.geopolitics ?? [])],
    macro: [...(master.sections.macro ?? [])],
    economics: [...(master.sections.economics ?? [])],
  };

  const globalSeen = new Set<string>();
  for (const tid of ALL_TOPIC_IDS) {
    for (const a of sections[tid]) {
      globalSeen.add(normUrl(a.link));
    }
  }

  let added = 0;
  for (const tr of topicResults) {
    const tid = tr.topicId;
    const picked = sections[tid];
    if (picked.length >= min) continue;

    const scored = tr.articles.map((a) => {
      const blob = `${a.title} ${a.summary}`;
      const relevance = keywordScoreForTopic(tr.topicId, blob);
      const marketImpact = keywordCount(blob, MARKET_IMPACT_KEYWORDS);
      return {
        a,
        relevance,
        eligible: isEligibleFallbackStory(tr.topicId, blob, relevance, marketImpact),
        score:
          relevance * 2 +
          marketImpact * 1.5 +
          trustedPublisherBoost(a.title, a.domain) -
          negativePenalty(blob) +
          recencyBoost(a.publishedAt) +
          (a.title.length > 40 ? 0.1 : 0),
      };
    });
    scored.sort((x, y) => y.score - x.score);

    const inTopic = new Set(picked.map((a) => normUrl(a.link)));
    for (const { a, eligible } of scored) {
      if (picked.length >= min) break;
      if (picked.length >= max) break;
      if (!eligible) continue;
      if (isNearDuplicateTitle(a, picked)) continue;
      const u = normUrl(a.link);
      if (inTopic.has(u)) continue;
      if (globalSeen.has(u)) continue;
      picked.push(a);
      inTopic.add(u);
      globalSeen.add(u);
      added++;
    }
    sections[tid] = picked;
  }

  if (added === 0) return master;

  return {
    ...master,
    sections,
    masterNotes: `${master.masterNotes ?? ""} · Filled to ≥${min}/topic where possible.`.trim(),
  };
}
