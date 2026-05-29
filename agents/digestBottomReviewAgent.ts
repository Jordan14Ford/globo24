/**
 * **Supplement agent — Bottom review**
 *
 * Short editorial note on Reddit + earnings supplements (OpenAI when configured).
 */
import OpenAI from "openai";
import type { DigestBottomPayload, SupplementReview } from "../types/pipeline";

type BottomForReview = Omit<DigestBottomPayload, "supplementReview">;

function fallbackReview(): SupplementReview {
  return {
    curatedBy: "keyword_fallback",
    text:
      "Supplement block: Reddit items are user-submitted links and threads on Reddit — not vetted journalism. " +
      "Earnings times come from the calendar provider; check each company’s IR site or the Nasdaq hub for live webcast links.",
  };
}

export async function runDigestBottomReviewAgent(bottom: BottomForReview): Promise<SupplementReview> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return fallbackReview();
  }

  const redditBits = bottom.reddit.flatMap((s) =>
    s.posts.map((p) => `[r/${s.subreddit}] ${p.title}`)
  );
  const earnBits = bottom.earnings.rows.map((r) => `${r.symbol} ${r.date} ${r.timeLabel ?? ""}`);
  const hubBits = (bottom.earningsCalls?.rows ?? []).map((h) => `${h.symbol} → ${h.hubLabel}`);

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_SUPPLEMENT_REVIEW_MODEL?.trim() || "gpt-4o-mini";

  try {
    const res = await client.chat.completions.create({
      model,
      temperature: 0.25,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You write a brief editor's note (2–4 sentences) for an email digest. " +
            "Clarify that Reddit content is user-generated and not editorially vetted. " +
            "Note that earnings call links/hubs may redirect to IR pages or webcasts. " +
            "Be neutral and professional. No markdown, no bullet points.",
        },
        {
          role: "user",
          content: JSON.stringify({
            redditSample: redditBits.slice(0, 24),
            earningsSymbols: earnBits.slice(0, 20),
            callHubs: hubBits.slice(0, 12),
          }),
        },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) return fallbackReview();
    return { curatedBy: "openai", text };
  } catch {
    return fallbackReview();
  }
}
