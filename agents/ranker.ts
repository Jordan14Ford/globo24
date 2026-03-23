import OpenAI from "openai";
import { TOP_STORIES_PER_REGION } from "../config/sources";
import type { NormalizedArticle, RankedRegionalResult, RegionalAgentResult } from "../types/pipeline";

const MACRO_KEYWORDS = [
  "rate",
  "rates",
  "interest",
  "fed",
  "ecb",
  "boj",
  "cpi",
  "inflation",
  "gdp",
  "recession",
  "oil",
  "gas",
  "commodit",
  "gold",
  "opec",
  "geopolit",
  "sanction",
  "nato",
  "war",
  "conflict",
  "treaty",
  "election",
  "china",
  "taiwan",
  "russia",
  "ukraine",
  "middle east",
  "dollar",
  "yen",
  "euro",
  "fx",
  "currency",
  "forex",
  "ai ",
  " artificial intelligence",
  "chip",
  "semiconductor",
  "trade",
  "tariff",
  "imf",
  "debt",
  "yield",
  "bond",
];

function keywordFallbackScore(text: string): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const kw of MACRO_KEYWORDS) {
    if (t.includes(kw.trim())) s += 1;
  }
  return s;
}

function rankByKeywordFallback(articles: NormalizedArticle[], limit: number): NormalizedArticle[] {
  const scored = articles.map((a) => ({
    a,
    score: keywordFallbackScore(`${a.title} ${a.summary}`),
  }));
  scored.sort((x, y) => y.score - x.score || (y.a.title.length > x.a.title.length ? 1 : -1));
  return scored.slice(0, limit).map((x) => x.a);
}

const rankerSchemaDescription = `You are a macro news editor. Rank articles by relevance to global macro themes:
interest rates & central banks, geopolitics, commodities, AI/industrial policy, FX & currencies.
Return JSON only: { "indices": number[] } — up to ${TOP_STORIES_PER_REGION} distinct indices (0-based) of the most macro-relevant stories, best first. Fewer if not enough quality matches.`;

/**
 * Uses OpenAI to pick top macro-relevant stories; falls back to keyword scoring on failure.
 */
export async function rankRegionalArticles(
  regional: RegionalAgentResult,
  apiKey: string | undefined
): Promise<RankedRegionalResult> {
  const regionId = regional.regionId;
  const log = (msg: string, x?: unknown) => console.log(`[ranker:${regionId}]`, msg, x ?? "");

  if (regional.articles.length === 0) {
    return {
      regionId: regional.regionId,
      regionName: regional.regionName,
      topStories: [],
      rankedBy: "keyword_fallback",
    };
  }

  if (!apiKey?.trim()) {
    log("No OPENAI_API_KEY — keyword fallback");
    return {
      regionId: regional.regionId,
      regionName: regional.regionName,
      topStories: rankByKeywordFallback(regional.articles, TOP_STORIES_PER_REGION),
      rankedBy: "keyword_fallback",
      error: "OPENAI_API_KEY missing",
    };
  }

  const client = new OpenAI({ apiKey });

  const payload = regional.articles.map((a, i) => ({
    i,
    title: a.title,
    link: a.link,
    summary: a.summary.slice(0, 500),
    source: a.sourceFeedName,
  }));

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_RANK_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: rankerSchemaDescription },
        {
          role: "user",
          content: JSON.stringify({ region: regional.regionName, articles: payload }),
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as { indices?: number[] };
    const indices = Array.isArray(parsed.indices) ? parsed.indices : [];

    const picked: NormalizedArticle[] = [];
    const used = new Set<number>();
    for (const idx of indices) {
      if (typeof idx !== "number" || idx < 0 || idx >= regional.articles.length) continue;
      if (used.has(idx)) continue;
      used.add(idx);
      picked.push(regional.articles[idx]);
      if (picked.length >= TOP_STORIES_PER_REGION) break;
    }

    if (picked.length === 0) {
      log("OpenAI returned no valid indices — keyword fallback");
      return {
        regionId: regional.regionId,
        regionName: regional.regionName,
        topStories: rankByKeywordFallback(regional.articles, TOP_STORIES_PER_REGION),
        rankedBy: "keyword_fallback",
        error: "empty OpenAI selection",
      };
    }

    log(`OpenAI ranked ${picked.length} stories`);
    return {
      regionId: regional.regionId,
      regionName: regional.regionName,
      topStories: picked,
      rankedBy: "openai",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("OpenAI error — keyword fallback", msg);
    return {
      regionId: regional.regionId,
      regionName: regional.regionName,
      topStories: rankByKeywordFallback(regional.articles, TOP_STORIES_PER_REGION),
      rankedBy: "keyword_fallback",
      error: msg,
    };
  }
}
