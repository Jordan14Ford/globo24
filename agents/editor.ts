import type { PipelineOutput, RankedRegionalResult } from "../types/pipeline";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Combine all regional ranked outputs into one HTML email for human review.
 * @deprecated Prefer {@link buildRegionalEditorialHtml} in `brutalistEditor.ts` — pipeline now uses the editorial template.
 */
export function buildDigestHtml(output: PipelineOutput): string {
  const when = esc(new Date(output.generatedAt).toUTCString());
  const blocks: string[] = [];

  blocks.push(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Global macro digest</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1117;color:#e6edf3;margin:0;padding:24px;}
.wrap{max-width:720px;margin:0 auto;}
h1{font-size:1.35rem;border-left:4px solid #58a6ff;padding-left:12px;}
.meta{color:#8b949e;font-size:0.85rem;margin-bottom:28px;}
section{margin-bottom:32px;border:1px solid #30363d;border-radius:10px;overflow:hidden;}
h2{margin:0;padding:12px 16px;background:#161b22;font-size:1rem;color:#c9d1d9;}
.badge{font-size:0.7rem;font-weight:600;padding:2px 8px;border-radius:6px;margin-left:8px;}
.badge-openai{background:#23863633;color:#3fb950;}
.badge-kw{background:#d2992233;color:#e3b341;}
ol{margin:0;padding:0;list-style:none;}
li{border-top:1px solid #21262d;padding:14px 16px;}
li a{color:#58a6ff;text-decoration:none;font-weight:500;}
li a:hover{text-decoration:underline;}
.small{color:#8b949e;font-size:0.8rem;margin-top:6px;}
footer{margin-top:40px;font-size:0.75rem;color:#484f58;text-align:center;}
</style></head><body><div class="wrap">`);

  blocks.push(`<h1>Global macro intelligence — human review</h1>`);
  blocks.push(`<p class="meta">Generated ${when} · Top stories per continent · OpenAI rank or keyword fallback</p>`);

  for (const r of output.regions) {
    blocks.push(renderRegion(r));
  }

  blocks.push(`<footer>Global News Pipeline · Automated draft — please verify sources before sharing.</footer></div></body></html>`);
  return blocks.join("\n");
}

function renderRegion(r: RankedRegionalResult): string {
  const badge =
    r.rankedBy === "openai"
      ? `<span class="badge badge-openai">OpenAI</span>`
      : `<span class="badge badge-kw">Keyword fallback</span>`;
  const err = r.error ? `<span class="small"> (${esc(r.error)})</span>` : "";

  const items =
    r.topStories.length === 0
      ? `<li><span class="small">No stories passed filters / feeds for this region.</span></li>`
      : r.topStories
          .map(
            (a, i) => `<li>
<strong>${i + 1}.</strong> <a href="${esc(a.link)}">${esc(a.title)}</a>
<div class="small">${esc(a.domain)} · ${esc(a.sourceFeedName)}${a.publishedAt ? ` · ${esc(a.publishedAt)}` : ""}</div>
${a.summary ? `<div class="small">${esc(a.summary.slice(0, 280))}${a.summary.length > 280 ? "…" : ""}</div>` : ""}
</li>`
          )
          .join("\n");

  return `<section>
<h2>${esc(r.regionName)} ${badge}${err}</h2>
<ol>${items}</ol>
</section>`;
}

export function buildPlainTextSummary(output: PipelineOutput): string {
  const lines: string[] = [];
  lines.push("GLOBAL MACRO DIGEST (human review)");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push("");
  for (const r of output.regions) {
    lines.push(`=== ${r.regionName} [${r.rankedBy}] ===`);
    if (r.topStories.length === 0) lines.push("(none)");
    r.topStories.forEach((a, i) => {
      lines.push(`${i + 1}. ${a.title}`);
      lines.push(`   ${a.link}`);
    });
    lines.push("");
  }
  return lines.join("\n");
}
