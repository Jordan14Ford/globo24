#!/usr/bin/env npx tsx
/**
 * QA diagnostics for the scheduled Globo News 24 newsletter.
 *
 * This intentionally avoids sending email. It checks schedule gates, workflow cron coverage,
 * generated digest content, supplement presence, and email-client clipping risk.
 */
import "./loadEnv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon";
import { TOPICS } from "../config/topicFeeds";
import { REDDIGEST_SUBREDDITS } from "../config/redditDigest";
import { resolveAgentRegistry } from "../lib/agents/registry";
import { compactEmailHtml } from "../lib/email/compactHtml";
import { checkSendWindow } from "../lib/schedule/eastern";
import { decideSchedule } from "../lib/schedule/scheduleDecision";
import { fetchEarningsDigestSection } from "../lib/supplements/fetchEarningsWeek";
import { fetchSubreddit } from "../lib/supplements/fetchRedditHot";
import type { MasterCuratedOutput, TopicId } from "../types/pipeline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORKFLOW = path.join(ROOT, ".github", "workflows", "global-news-digest.yml");
const DIGEST_HTML = path.join(ROOT, "output", "digest.html");
const PIPELINE_JSON = path.join(ROOT, "output", "pipeline-output.json");

type Status = "pass" | "warn" | "fail";

interface Check {
  status: Status;
  area: string;
  detail: string;
}

const checks: Check[] = [];

function record(status: Status, area: string, detail: string): void {
  checks.push({ status, area, detail });
}

function boolStatus(ok: boolean): Status {
  return ok ? "pass" : "fail";
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function checkScheduleWindows(): void {
  const day = "2026-05-29";
  const samples: { iso: string; want: "morning" | "evening" | null }[] = [
    { iso: `${day}T08:59:00-04:00`, want: null },
    { iso: `${day}T09:00:00-04:00`, want: "morning" },
    { iso: `${day}T09:59:00-04:00`, want: "morning" },
    { iso: `${day}T10:00:00-04:00`, want: null },
    { iso: `${day}T15:59:00-04:00`, want: null },
    { iso: `${day}T16:00:00-04:00`, want: "evening" },
    { iso: `${day}T17:59:00-04:00`, want: "evening" },
    { iso: `${day}T18:00:00-04:00`, want: null },
  ];

  for (const sample of samples) {
    const result = checkSendWindow(DateTime.fromISO(sample.iso, { setZone: true }));
    record(
      boolStatus(result.slot === sample.want),
      "schedule",
      `${sample.iso} -> ${result.slot ?? "skip"} (${result.detail})`
    );
  }
}

function checkWorkflowCron(): void {
  if (!existsSync(WORKFLOW)) {
    record("fail", "workflow", "Missing .github/workflows/global-news-digest.yml");
    return;
  }
  const yaml = readFileSync(WORKFLOW, "utf-8");
  record(
    boolStatus(yaml.includes('cron: "7,22,37,52 12,13,14 * * *"')),
    "workflow",
    "Morning retries start before the 09:00-10:00 ET window at off-peak minutes"
  );
  record(
    boolStatus(yaml.includes('cron: "7,22,37,52 19,20,21,22 * * *"')),
    "workflow",
    "Evening retries start before the 16:00-18:00 ET window at off-peak minutes"
  );
  record(
    boolStatus(yaml.includes("SCHEDULE_SLOT:")),
    "workflow",
    "Workflow preserves intended slot when GitHub queues a run late"
  );
  record(
    boolStatus(yaml.includes("REDDIT_CLIENT_ID") && yaml.includes("REDDIT_CLIENT_SECRET")),
    "workflow",
    "Workflow passes optional Reddit OAuth secrets into the digest job"
  );
}

function checkScheduledCatchup(): void {
  const cases = [
    {
      label: "late morning trigger catches up before evening",
      nowIso: "2026-06-01T14:43:00-04:00",
      scheduledSlot: "morning" as const,
      want: "morning",
    },
    {
      label: "morning trigger cannot leak into evening",
      nowIso: "2026-06-01T16:05:00-04:00",
      scheduledSlot: "morning" as const,
      want: null,
    },
    {
      label: "late evening trigger catches up the same night",
      nowIso: "2026-06-01T18:27:00-04:00",
      scheduledSlot: "evening" as const,
      want: "evening",
    },
    {
      label: "early queued trigger waits for its target window",
      nowIso: "2026-06-01T08:30:00-04:00",
      scheduledSlot: "morning" as const,
      want: null,
    },
  ];

  for (const testCase of cases) {
    const result = decideSchedule("auto", {
      nowIso: testCase.nowIso,
      scheduledSlot: testCase.scheduledSlot,
    });
    const actual = result.action === "proceed" ? result.slot : null;
    record(boolStatus(actual === testCase.want), "schedule-catchup", testCase.label);
  }
}

function checkAgentCoverage(): void {
  const registry = resolveAgentRegistry("topics");
  const required = [
    "topic.search",
    "topic.master_review",
    "topic.compile",
    "supplement.reddit",
    "supplement.earnings_week",
    "supplement.earnings_calls",
  ] as const;
  for (const id of required) {
    record(boolStatus(registry.byId[id] === true), "agents", `${id} enabled`);
  }
}

function checkFeedCoverage(): void {
  const byId = new Map(TOPICS.map((topic) => [topic.id, topic]));
  const required: TopicId[] = ["tech", "geopolitics", "macro", "economics"];
  for (const id of required) {
    const topic = byId.get(id);
    record(boolStatus(!!topic), "feeds", `${id} topic feed configured`);
  }
  const macro = byId.get("macro");
  const econ = byId.get("economics");
  record(
    boolStatus(!!macro && /central bank|inflation|bond|currency|Federal Reserve/i.test(macro.googleNewsRssUrl)),
    "feeds",
    "Macro feed query targets central banks, rates, inflation, yields, and FX"
  );
  record(
    boolStatus(!!econ && /GDP|recession|unemployment|trade|tariffs|jobs/i.test(econ.googleNewsRssUrl)),
    "feeds",
    "Economics feed query targets GDP, recession, labor, trade, and tariffs"
  );
  record(
    boolStatus(REDDIGEST_SUBREDDITS.length >= 8),
    "reddit",
    `${REDDIGEST_SUBREDDITS.length} configured subreddit sections`
  );
  record(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET ? "pass" : "warn",
    "reddit",
    "Reddit OAuth credentials configured for scheduled server-side pulls"
  );
}

function checkGeneratedDigest(): void {
  if (!existsSync(PIPELINE_JSON)) {
    record("warn", "digest", "No output/pipeline-output.json found; run npm run pipeline for content diagnostics");
    return;
  }

  const payload = readJson<MasterCuratedOutput>(PIPELINE_JSON);
  if (!payload) {
    record("fail", "digest", "Could not parse output/pipeline-output.json");
    return;
  }

  const topics: TopicId[] = ["tech", "geopolitics", "macro", "economics"];
  for (const id of topics) {
    const count = payload.sections?.[id]?.length ?? 0;
    record(count > 0 ? "pass" : "fail", "digest", `${id} stories selected: ${count}`);
  }
  const selectedTitles = topics.flatMap((id) =>
    (payload.sections?.[id] ?? []).map((article) => article.title)
  );
  const lowSignal = selectedTitles.filter((title) =>
    /\b(my two cents|guest column|parody|teaches how to hear god|motley fool|buy this|stocks? that also pay dividends|prediction:|precision trading|risk zones|stocks? tumbling|stock traders daily|foreignpolicyjournal\.com)\b/i.test(
      title
    )
  );
  record(
    boolStatus(lowSignal.length === 0),
    "relevance",
    lowSignal.length === 0
      ? "No low-signal opinion/parody/soft-interest headlines selected"
      : `Low-signal headlines selected: ${lowSignal.join(" | ")}`
  );

  const bottom = payload.digestBottom;
  record(boolStatus(!!bottom), "supplements", "Digest bottom payload exists");
  if (!bottom) return;

  record(
    bottom.earnings.rows.length > 0 ? "pass" : "warn",
    "earnings",
    `Earnings rows in payload: ${bottom.earnings.rows.length}${bottom.earnings.fetchError ? ` (${bottom.earnings.fetchError})` : ""}`
  );
  record(
    (bottom.earningsCalls?.rows.length ?? 0) > 0 ? "pass" : "warn",
    "earnings",
    `Earnings call hub rows: ${bottom.earningsCalls?.rows.length ?? 0}`
  );
  const redditPostCount = bottom.reddit.reduce((sum, section) => sum + section.posts.length, 0);
  record(redditPostCount > 0 ? "pass" : "warn", "reddit", `Reddit posts in payload: ${redditPostCount}`);
}

function checkEmailSize(): void {
  if (!existsSync(DIGEST_HTML)) {
    record("warn", "email-client", "No output/digest.html found; run npm run pipeline for HTML diagnostics");
    return;
  }
  const raw = readFileSync(DIGEST_HTML, "utf-8");
  const compact = compactEmailHtml(raw);
  const rawBytes = Buffer.byteLength(raw, "utf8");
  const compactBytes = Buffer.byteLength(compact, "utf8");
  record(rawBytes < 102_000 ? "pass" : "warn", "email-client", `Raw HTML size: ${rawBytes} bytes`);
  record(
    compactBytes < 102_000 ? "pass" : "fail",
    "email-client",
    `Compacted send HTML size: ${compactBytes} bytes (target < 102000 to avoid clipping)`
  );
  record(
    boolStatus(/max-width:760px/.test(raw) && /width="100%"/.test(raw)),
    "email-client",
    "Email uses fixed max-width frame with fluid table width"
  );
}

async function checkLiveEarnings(): Promise<void> {
  if (process.env.QA_LIVE_EARNINGS !== "1") return;
  const earnings = await fetchEarningsDigestSection();
  record(
    earnings.rows.length > 0 ? "pass" : "warn",
    "live-earnings",
    `${earnings.weekLabel}: ${earnings.rows.length} rows${earnings.fetchError ? ` (${earnings.fetchError})` : ""}`
  );
}

async function checkLiveReddit(): Promise<void> {
  if (process.env.QA_LIVE_REDDIT !== "1") return;
  const sample = REDDIGEST_SUBREDDITS.slice(0, 3);
  for (const { subreddit } of sample) {
    const result = await fetchSubreddit(subreddit, 10);
    record(
      result.posts.length > 0 ? "pass" : "warn",
      "live-reddit",
      `r/${subreddit}: ${result.posts.length} posts${result.error ? ` (${result.error})` : ""}`
    );
  }
}

async function main(): Promise<void> {
  checkScheduleWindows();
  checkScheduledCatchup();
  checkWorkflowCron();
  checkAgentCoverage();
  checkFeedCoverage();
  checkGeneratedDigest();
  checkEmailSize();
  await checkLiveEarnings();
  await checkLiveReddit();

  for (const check of checks) {
    const label = check.status.toUpperCase().padEnd(4);
    console.log(`${label} ${check.area}: ${check.detail}`);
  }

  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  console.log(`SUMMARY pass=${checks.length - failCount - warnCount} warn=${warnCount} fail=${failCount}`);
  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[qa:newsletter] FATAL", e);
  process.exit(1);
});
