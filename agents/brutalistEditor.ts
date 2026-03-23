/**
 * **Compile — digest email body**
 *
 * Single editorial layout for **topics** and **regions** pipelines: warm paper palette,
 * serif headlines, image-led cards, bento block. Images use RSS `imageUrl` when present;
 * otherwise Unsplash fallbacks (stable by index).
 *
 * @see docs/ARCHITECTURE.md
 */
import type {
  MasterCuratedOutput,
  NormalizedArticle,
  RegionalPipelineOutput,
  TopicId,
} from "../types/pipeline";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractPublisher(a: NormalizedArticle): string {
  const dashIdx = a.title.lastIndexOf(" - ");
  if (dashIdx > 0 && dashIdx < a.title.length - 3) {
    return a.title.slice(dashIdx + 3).trim();
  }
  return a.domain;
}

function cleanTitle(title: string): string {
  const dashIdx = title.lastIndexOf(" - ");
  if (dashIdx > 0) return title.slice(0, dashIdx).trim();
  return title;
}

const ORDER: TopicId[] = ["tech", "geopolitics", "macro", "economics"];

const TOPIC_LABEL: Record<TopicId, string> = {
  tech: "Tech",
  geopolitics: "Geopolitics",
  macro: "Macro",
  economics: "Economics",
};

/** One row in the digest (topic pillar or region name). */
export type EditorialStoryRow = { article: NormalizedArticle; sectionLabel: string };

/** Stock photos when RSS has no image (Unsplash; hotlink allowed for dev/preview). */
const UNSPLASH_FALLBACKS = [
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2000",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1400",
  "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?q=80&w=1400",
  "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=1400",
  "https://images.unsplash.com/photo-1495020689067-958852a7765e?q=80&w=1400",
  "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=1400",
  "https://images.unsplash.com/photo-1586339949916-3e9457bef6d3?q=80&w=1400",
  "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1400",
];

function resolveImage(a: NormalizedArticle, index: number): string {
  const u = a.imageUrl?.trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return UNSPLASH_FALLBACKS[index % UNSPLASH_FALLBACKS.length];
}

function clipSummary(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatEditionDate(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const hour = d.getUTCHours();
  const slot = hour < 12 ? "Morning" : "Evening";
  return `${dateStr} · ${slot} Edition`;
}

function flattenTopicStories(out: MasterCuratedOutput): EditorialStoryRow[] {
  const rows: EditorialStoryRow[] = [];
  for (const tid of ORDER) {
    for (const a of out.sections[tid] ?? []) {
      rows.push({ article: a, sectionLabel: TOPIC_LABEL[tid] });
    }
  }
  return rows;
}

function flattenRegionalStories(output: RegionalPipelineOutput): EditorialStoryRow[] {
  const rows: EditorialStoryRow[] = [];
  for (const r of output.regions) {
    for (const a of r.topStories) {
      rows.push({ article: a, sectionLabel: r.regionName });
    }
  }
  return rows;
}

/** Card: image + dark caption bar (email-safe vs absolute overlay). */
function storyCard(params: {
  article: NormalizedArticle;
  sectionLabel: string;
  imgIndex: number;
  titleSize: "large" | "medium" | "small";
}): string {
  const { article, sectionLabel, imgIndex, titleSize } = params;
  const title = cleanTitle(article.title);
  const img = resolveImage(article, imgIndex);

  const fontSize =
    titleSize === "large" ? "28px" : titleSize === "medium" ? "22px" : "18px";
  const lineHeight = "1.15";

  return `
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 12px 0;background:#000000;">
  <tr>
    <td style="padding:0;line-height:0;">
      <a href="${esc(article.link)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
        <img src="${esc(img)}" width="600" alt="${esc(title)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 16px 16px 16px;background:#1a1a1a;mso-line-height-rule:exactly;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#8b1e1e;margin-bottom:6px;">${esc(sectionLabel)}</div>
      <h3 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:${fontSize};line-height:${lineHeight};letter-spacing:-0.02em;font-weight:700;">
        <a href="${esc(article.link)}" target="_blank" rel="noopener noreferrer" style="color:#ffffff;text-decoration:none;">${esc(title)}</a>
      </h3>
    </td>
  </tr>
</table>`.trim();
}

function heroTextBlock(article: NormalizedArticle, sectionLabel: string): string {
  const title = cleanTitle(article.title);
  const summary = article.summary ? clipSummary(article.summary, 280) : "";
  return `
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-bottom:1px solid #d8d1c7;padding-bottom:26px;margin-bottom:8px;">
  <tr>
    <td style="padding:18px 0 0 0;mso-line-height-rule:exactly;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8b1e1e;margin-bottom:12px;">Lead Story · ${esc(sectionLabel)}</div>
      <h2 style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1.02;letter-spacing:-0.03em;font-weight:700;">
        <a href="${esc(article.link)}" target="_blank" rel="noopener noreferrer" style="color:#171717;text-decoration:none;">${esc(title)}</a>
      </h2>
      ${summary ? `<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.5;color:#5e5a55;">${esc(summary)}</p>` : ""}
    </td>
  </tr>
</table>`.trim();
}

function bentoSection(rows: EditorialStoryRow[], startIdx: number, bentoHeading: string): string {
  const slice = rows.slice(startIdx, startIdx + 4);
  if (slice.length === 0) return "";

  const parts: string[] = [];
  parts.push(`
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td style="padding:24px 0 18px 0;border-top:1px solid #d8d1c7;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5e5a55;margin-bottom:18px;">${esc(bentoHeading)}</div>
    </td>
  </tr>
</table>`);

  if (slice.length === 1) {
    parts.push(
      storyCard({
        article: slice[0].article,
        sectionLabel: slice[0].sectionLabel,
        imgIndex: startIdx,
        titleSize: "medium",
      })
    );
  } else if (slice.length === 2) {
    parts.push(`
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td width="50%" valign="top" style="padding:0 6px 0 0;">${storyCard({ article: slice[0].article, sectionLabel: slice[0].sectionLabel, imgIndex: startIdx, titleSize: "small" })}</td>
    <td width="50%" valign="top" style="padding:0 0 0 6px;">${storyCard({ article: slice[1].article, sectionLabel: slice[1].sectionLabel, imgIndex: startIdx + 1, titleSize: "small" })}</td>
  </tr>
</table>`);
  } else {
    const [a, b, c, d] = [slice[0], slice[1], slice[2], slice[3]];
    parts.push(`
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td width="50%" valign="top" rowspan="2" style="padding:0 6px 0 0;">
      ${storyCard({ article: a.article, sectionLabel: a.sectionLabel, imgIndex: startIdx, titleSize: "medium" })}
    </td>
    <td width="50%" valign="top" style="padding:0 0 6px 6px;">
      ${storyCard({ article: b.article, sectionLabel: b.sectionLabel, imgIndex: startIdx + 1, titleSize: "small" })}
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" style="padding:6px 0 0 6px;">
      ${storyCard({ article: c.article, sectionLabel: c.sectionLabel, imgIndex: startIdx + 2, titleSize: "small" })}
    </td>
  </tr>
  ${d ? `<tr><td colspan="2" style="padding:12px 0 0 0;">${storyCard({ article: d.article, sectionLabel: d.sectionLabel, imgIndex: startIdx + 3, titleSize: "small" })}</td></tr>` : ""}
</table>`);
  }

  return parts.join("\n");
}

function moreStoriesSection(rows: EditorialStoryRow[]): string {
  if (rows.length === 0) return "";

  const blocks: string[] = [];
  blocks.push(`
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td style="padding:24px 0 12px 0;border-top:1px solid #d8d1c7;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5e5a55;margin-bottom:18px;">More coverage</div>
    </td>
  </tr>
</table>`);

  let globalIdx = 5;
  for (const { article, sectionLabel } of rows) {
    const title = cleanTitle(article.title);
    const pub = extractPublisher(article);
    const sum = article.summary ? clipSummary(article.summary, 220) : "";
    const img = resolveImage(article, globalIdx++);
    blocks.push(`
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:22px;border-bottom:1px solid #d8d1c7;padding-bottom:22px;">
  <tr>
    <td style="padding:0 0 12px 0;">
      <a href="${esc(article.link)}" target="_blank" rel="noopener noreferrer"><img src="${esc(img)}" width="560" alt="" style="display:block;width:100%;max-width:100%;height:auto;border:0;" /></a>
    </td>
  </tr>
  <tr>
    <td style="mso-line-height-rule:exactly;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#8b1e1e;margin-bottom:6px;">${esc(sectionLabel)}</div>
      <h3 style="margin:0 0 6px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.08;letter-spacing:-0.02em;font-weight:700;">
        <a href="${esc(article.link)}" target="_blank" rel="noopener noreferrer" style="color:#171717;text-decoration:none;">${esc(title)}</a>
      </h3>
      <p style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.45;color:#5e5a55;">${sum ? esc(sum) : ""}</p>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;"><a href="${esc(article.link)}" style="color:#171717;text-decoration:underline;">${esc(pub)}</a></div>
    </td>
  </tr>
</table>`);
  }

  return blocks.join("\n");
}

const EDITORIAL_CSS = `
  :root { --bg:#f3efe7; --paper:#fbf8f2; --ink:#171717; --muted:#5e5a55; --rule:#d8d1c7; --accent:#8b1e1e; --chip:#ece6db; }
  body { margin:0; padding:0; background:var(--bg); color:var(--ink); -webkit-font-smoothing:antialiased; }
  .frame { max-width:760px; margin:0 auto; background:var(--paper); border:1px solid var(--rule); }
  .inner { padding:28px 28px 36px; }
  @media only screen and (max-width: 640px) {
    .inner { padding:20px 16px 28px !important; }
  }
`.replace(/\s+/g, " ").trim();

export interface EditorialDigestParams {
  generatedAt: string;
  flat: EditorialStoryRow[];
  /** e.g. "Global News Pipeline" or "Regional News Agent" */
  eyebrowLeft: string;
  subdeck: string;
  bentoHeading: string;
  /** Shown in footer (plain text; escaped when rendered) */
  curatorFooterLine: string;
  masterNotes?: string;
  error?: string;
}

/**
 * Shared editorial HTML used for both topic and regional digests.
 * Ensures `npm run send:test` always matches this layout when `output/digest.html` was built from either pipeline mode.
 */
export function buildEditorialDigestHtml(p: EditorialDigestParams): string {
  const when = esc(new Date(p.generatedAt).toUTCString());
  const notes = p.masterNotes ? esc(p.masterNotes) : "";
  const err = p.error ? esc(p.error) : "";
  const edition = esc(formatEditionDate(p.generatedAt));
  const flat = p.flat;
  const curator = esc(p.curatorFooterLine);

  if (flat.length === 0) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Globo News 24</title><style>${EDITORIAL_CSS}</style></head>
<body style="margin:0;padding:32px 16px;background:#f3efe7;">
<table class="frame" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:760px;margin:0 auto;background:#fbf8f2;border:1px solid #d8d1c7;">
<tr><td class="inner" style="padding:28px 28px 36px;">
  <p style="font-family:Georgia,serif;">No stories in this digest. ${err ? `(${err})` : ""}</p>
  <p style="font-family:Arial,sans-serif;font-size:12px;color:#5e5a55;">Generated: ${when} · ${curator}</p>
</td></tr></table></body></html>`;
  }

  const lead = flat[0];
  const leadImg = resolveImage(lead.article, 0);
  const leadTitle = cleanTitle(lead.article.title);

  const heroImageOnly = `
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:26px 0 0 0;">
  <tr>
    <td style="padding:0;line-height:0;">
      <a href="${esc(lead.article.link)}" target="_blank" rel="noopener noreferrer">
        <img src="${esc(leadImg)}" width="600" alt="${esc(leadTitle)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;" />
      </a>
    </td>
  </tr>
</table>`;

  const bentoStart = 1;
  const bentoHtml = flat.length > 1 ? bentoSection(flat, bentoStart, p.bentoHeading) : "";
  const moreHtml = flat.length > 5 ? moreStoriesSection(flat.slice(5)) : "";

  const headerNotes = [notes ? `Notes: ${notes}` : "", err ? `Status: ${err}` : ""].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="x-ua-compatible" content="ie=edge"/>
  <title>The Editorial Digest</title>
  <style type="text/css">${EDITORIAL_CSS}</style>
</head>
<body style="margin:0;padding:32px 16px;background:#f3efe7;color:#171717;font-family:Georgia,'Times New Roman',serif;line-height:1.45;">
  <table class="frame" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:760px;margin:0 auto;background:#fbf8f2;border:1px solid #d8d1c7;box-shadow:0 18px 60px rgba(0,0,0,0.08);">
    <tr>
      <td class="inner" style="padding:28px 28px 36px;">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding-bottom:16px;border-bottom:1px solid #d8d1c7;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#5e5a55;">${esc(p.eyebrowLeft)}</td>
                <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#5e5a55;">${edition}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="text-align:center;padding:18px 0 10px 0;">
              <div style="font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.22em;font-size:11px;color:#5e5a55;margin-bottom:8px;">Global Briefing</div>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:46px;line-height:0.95;font-weight:700;letter-spacing:-0.03em;color:#171717;">The Editorial Digest</h1>
              <p style="margin:14px auto 0;max-width:560px;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;color:#5e5a55;">
                ${esc(p.subdeck)}
              </p>
            </td>
          </tr>
        </table>

        ${heroImageOnly}
        ${heroTextBlock(lead.article, lead.sectionLabel)}
        ${bentoHtml}
        ${moreHtml}

        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding-top:24px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.7;color:#5e5a55;">
              ${curator} · ${when}<br/>
              ${headerNotes ? `${headerNotes}<br/>` : ""}
              Globo News 24 · Editorial layout with image-led storytelling
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Topics pipeline → same editorial template as regions. */
export function buildBrutalistHtml(out: MasterCuratedOutput): string {
  return buildEditorialDigestHtml({
    generatedAt: out.generatedAt,
    flat: flattenTopicStories(out),
    eyebrowLeft: "Global News Pipeline",
    subdeck:
      "A calmer, more narrative presentation of the day’s developments across tech, geopolitics, macro, and economics — curated for your inbox.",
    bentoHeading: "Cross-topic briefing",
    curatorFooterLine: `Curated by ${out.curatedBy}`,
    masterNotes: out.masterNotes,
    error: out.error,
  });
}

/** Regions pipeline → same editorial shell; stories ordered by region. */
export function buildRegionalEditorialHtml(output: RegionalPipelineOutput): string {
  const rankingBits = output.regions.map((r) => `${r.regionName} (${r.rankedBy}${r.error ? `; ${r.error}` : ""})`);
  return buildEditorialDigestHtml({
    generatedAt: output.generatedAt,
    flat: flattenRegionalStories(output),
    eyebrowLeft: "Regional News Agent",
    subdeck:
      "A calmer, more narrative read of the day’s developments by continent — ranked for clarity.",
    bentoHeading: "Regional Bento",
    curatorFooterLine: `Per-region ranking · ${rankingBits.join(" · ")}`,
  });
}

/** Plain text body for multipart email (topics). */
export function buildBrutalistPlain(out: MasterCuratedOutput): string {
  const when = new Date(out.generatedAt).toUTCString();
  const rows: string[] = [];
  rows.push("================================================================");
  rows.push("GLOBAL NEWS — GLOBO NEWS 24");
  rows.push(`Generated: ${when}`);
  rows.push(`Curator: ${out.curatedBy}${out.error ? ` | ${out.error}` : ""}`);
  if (out.masterNotes) rows.push(`Notes: ${out.masterNotes}`);
  rows.push("================================================================");
  rows.push("");

  const labels: Record<TopicId, string> = {
    tech: "TECH",
    geopolitics: "GEOPOLITICS",
    macro: "MACRO TRENDS",
    economics: "ECONOMICS",
  };

  for (const tid of ORDER) {
    const stories = out.sections[tid] ?? [];
    rows.push(`--- ${labels[tid]} ---`);
    if (stories.length === 0) rows.push("(no stories)");
    else {
      stories.forEach((a, i) => {
        const pub = extractPublisher(a);
        const title = cleanTitle(a.title);
        rows.push(`${i + 1}. ${title}`);
        rows.push(`   [${pub}] ${a.link}`);
        if (a.imageUrl) rows.push(`   Image: ${a.imageUrl}`);
        if (a.summary) rows.push(`   ${a.summary.slice(0, 220).replace(/\s+/g, " ")}`);
        rows.push("");
      });
    }
    rows.push("");
  }
  rows.push("================================================================");
  rows.push("END");
  return rows.join("\n");
}
