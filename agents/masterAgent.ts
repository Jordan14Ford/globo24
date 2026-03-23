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
import { TOP_STORIES_PER_TOPIC } from "../config/topicFeeds";
import type {
  CuratedBy,
  MasterCuratedOutput,
  NormalizedArticle,
  TopicAgentResult,
  TopicId,
} from "../types/pipeline";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function negativePenalty(text: string): number {
  let p = 0;
  for (const re of NEGATIVE_PATTERNS) {
    if (re.test(text)) p += 2;
  }
  return p;
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
      return {
        a,
        score:
          keywordScoreForTopic(tr.topicId, blob) -
          negativePenalty(blob) +
          recencyBoost(a.publishedAt) +
          (a.title.length > 40 ? 0.1 : 0),
      };
    });
    scored.sort((x, y) => y.score - x.score);

    const pubCount = new Map<string, number>();
    const picked: NormalizedArticle[] = [];
    for (const { a } of scored) {
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

    const ids: TopicId[] = ["tech", "geopolitics", "macro", "economics"];
    for (const tid of ids) {
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

    const empty = ids.every((id) => sections[id].length === 0);
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
