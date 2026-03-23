#!/usr/bin/env npx tsx
/**
 * Pipeline entrypoint — wires the four stages for the default “topics” mode:
 *
 * 1. **Search** — `runTopicAgent` × 4 (parallel): RSS → candidates per topic.
 * 2. **Review** — `runMasterAgent`: LLM or keyword fallback → final picks per topic.
 * 3. **Compile** — `buildBrutalistHtml` / `buildBrutalistPlain` → `output/digest.*`
 * 4. **Send** is separate: `npm run send` / `sendEmail.ts` reads those files and mails to `EMAIL_TO`.
 *
 * `PIPELINE_MODE=regions`: per-continent RSS + ranker → **same editorial HTML** as topics (`buildRegionalEditorialHtml`).
 *
 * **Phase 3 slice:** `PIPELINE_SLICE=1` limits search + curation to `PIPELINE_SLICE_TOPICS` (default `tech`).
 * **Phase 4:** run history (`data/run-history.json`), optional artifacts (`RUN_ARTIFACTS=1`), `PIPELINE_LOG_FORMAT=json`.
 * **Phase 5:** centralized agent registry + enable-state controls (`AGENT_ENABLE`, `AGENT_DISABLE`).
 *
 * @see docs/ARCHITECTURE.md
 * @see docs/PHASE4_RUN_HISTORY.md
 * @see docs/PHASE5_AGENT_REGISTRY.md
 */
import "./loadEnv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRegionalAgent } from "../agents/regionalAgent";
import { rankRegionalArticles } from "../agents/ranker";
import { buildPlainTextSummary } from "../agents/editor";
import { runTopicAgent } from "../agents/topicAgent";
import { runMasterAgent } from "../agents/masterAgent";
import { resolveGoogleNewsUrls } from "../agents/rssUtil";
import {
  buildBrutalistHtml,
  buildBrutalistPlain,
  buildRegionalEditorialHtml,
} from "../agents/brutalistEditor";
import { REGIONS } from "../config/sources";
import { getTopicConfigsForPipelineRun, getSliceTopicIds, isPipelineSliceMode } from "../lib/pipeline/sliceConfig";
import { persistStoriesAndDigest } from "../lib/content/contentStore";
import {
  assertAgentEnabled,
  enabledAgentIds,
  ensureAgentRegistryFileExists,
  resolveAgentRegistry,
  type ResolvedAgentRegistry,
} from "../lib/agents/registry";
import { snapshotOutputToRunDir } from "../lib/run/artifacts";
import {
  appendRunRecord,
  ensureRunHistoryFileExists,
  isRunHistoryEnabled,
} from "../lib/run/runHistory";
import { getOrCreateRunId } from "../lib/run/runId";
import { pipelineEmit } from "../lib/run/structuredLog";
import type { MasterCuratedOutput, RegionalPipelineOutput } from "../types/pipeline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "output");

async function runRegionsPipeline(registry: ResolvedAgentRegistry): Promise<{
  json: RegionalPipelineOutput;
  html: string;
  text: string;
}> {
  assertAgentEnabled(registry, "regions.search", "Enable via AGENT_ENABLE=regions.search");
  assertAgentEnabled(registry, "regions.rank", "Enable via AGENT_ENABLE=regions.rank");
  assertAgentEnabled(registry, "regions.compile", "Enable via AGENT_ENABLE=regions.compile");
  console.log("[pipeline] MODE=regions — continental RSS + ranker");

  const regionalResults = await Promise.all(
    REGIONS.map(async (config) => {
      try {
        return await runRegionalAgent(config);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[pipeline] Regional agent crashed: ${config.id}`, msg);
        return {
          regionId: config.id,
          regionName: config.name,
          articles: [],
          errors: [`fatal: ${msg}`],
          fetchedAt: new Date().toISOString(),
        };
      }
    })
  );

  const apiKey = process.env.OPENAI_API_KEY;
  const rankedResults = await Promise.all(
    regionalResults.map((r) => rankRegionalArticles(r, apiKey))
  );

  const output: RegionalPipelineOutput = {
    generatedAt: new Date().toISOString(),
    regions: rankedResults,
  };

  const html = buildRegionalEditorialHtml(output);
  const text = buildPlainTextSummary(output);

  return { json: output, html, text };
}

async function runTopicsPipeline(registry: ResolvedAgentRegistry): Promise<{
  json: MasterCuratedOutput;
  html: string;
  text: string;
}> {
  assertAgentEnabled(registry, "topic.search", "Enable via AGENT_ENABLE=topic.search");
  assertAgentEnabled(registry, "topic.master_review", "Enable via AGENT_ENABLE=topic.master_review");
  assertAgentEnabled(registry, "topic.compile", "Enable via AGENT_ENABLE=topic.compile");
  const topicConfigs = getTopicConfigsForPipelineRun();
  const slice = isPipelineSliceMode();
  if (slice) {
    console.log(
      "[pipeline] MODE=topics — SLICE — topics:",
      topicConfigs.map((t) => t.id).join(", ")
    );
  } else {
    console.log("[pipeline] MODE=topics — search agents → review → compile digest");
  }

  const topicResults = await Promise.all(
    topicConfigs.map(async (config) => {
      try {
        return await runTopicAgent(config);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[pipeline] Topic agent crashed: ${config.id}`, msg);
        return {
          topicId: config.id,
          topicLabel: config.label,
          articles: [],
          errors: [`fatal: ${msg}`],
          fetchedAt: new Date().toISOString(),
        };
      }
    })
  );

  const apiKey = process.env.OPENAI_API_KEY;
  let master: MasterCuratedOutput = await runMasterAgent(topicResults, apiKey);

  if (slice) {
    const ids = topicConfigs.map((t) => t.id).join(", ");
    master = {
      ...master,
      masterNotes: `[PIPELINE_SLICE: ${ids}] ${master.masterNotes ?? ""}`.trim(),
    };
  }

  const allSelected = Object.values(master.sections).flat();
  if (registry.byId["topic.resolve_links"]) {
    await resolveGoogleNewsUrls(allSelected);
  } else {
    console.warn("[pipeline] Agent disabled: topic.resolve_links — skipping URL resolution");
  }

  const html = buildBrutalistHtml(master);
  const text = buildBrutalistPlain(master);

  return { json: master, html, text };
}

interface WriteMeta {
  runId: string;
  startedAt: string;
  pipelineMode: "topics" | "regions";
  slice: boolean;
  sliceTopics?: string[];
  agentIds: ReturnType<typeof enabledAgentIds>;
}

function writeOutputs(
  jsonPayload: RegionalPipelineOutput | MasterCuratedOutput,
  html: string,
  text: string,
  meta: WriteMeta
): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, "digest.html");
  const jsonPath = path.join(OUT_DIR, "pipeline-output.json");
  const txtPath = path.join(OUT_DIR, "digest.txt");

  writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf-8");
  writeFileSync(htmlPath, html, "utf-8");
  writeFileSync(txtPath, text, "utf-8");

  pipelineEmit("pipeline", meta.runId, `Wrote digest + pipeline-output.json`, "output_written", {
    htmlPath,
    txtPath,
    jsonPath,
  });

  const artifactsRelPath = snapshotOutputToRunDir(meta.runId, ROOT);
  persistStoriesAndDigest({
    runId: meta.runId,
    pipelineMode: meta.pipelineMode,
    payload: jsonPayload,
    slice: meta.slice,
    sliceTopics: meta.sliceTopics,
    artifactsRelPath,
  });

  if (isRunHistoryEnabled()) {
    ensureRunHistoryFileExists();
    appendRunRecord({
      runId: meta.runId,
      kind: "pipeline",
      startedAt: meta.startedAt,
      finishedAt: new Date().toISOString(),
      status: "success",
      pipelineMode: meta.pipelineMode,
      slice: meta.slice,
      sliceTopics: meta.sliceTopics,
      agentIds: meta.agentIds,
      artifactsRelPath,
    });
  }

  pipelineEmit(
    "pipeline",
    meta.runId,
    "Done. Stage 4 — send: npm run send (uses EMAIL_TO, e.g. from .env)",
    "pipeline_complete",
    { pipelineMode: meta.pipelineMode }
  );
}

async function main() {
  const runId = getOrCreateRunId();
  const startedAt = new Date().toISOString();
  const mode = (process.env.PIPELINE_MODE ?? "topics").toLowerCase();
  const runtimeMode = mode === "regions" ? "regions" : "topics";
  ensureAgentRegistryFileExists();
  const registry = resolveAgentRegistry(runtimeMode);
  const activeAgents = enabledAgentIds(registry);

  pipelineEmit("pipeline", runId, `starting (PIPELINE_MODE=${mode})`, "pipeline_start", {
    pipelineMode: mode,
    agentIds: activeAgents,
  });

  try {
    if (mode === "regions") {
      if (isPipelineSliceMode()) {
        console.warn(
          "[pipeline] PIPELINE_SLICE is set but PIPELINE_MODE=regions — slice applies to topics mode only; ignoring."
        );
      }
      const out = await runRegionsPipeline(registry);
      writeOutputs(out.json, out.html, out.text, {
        runId,
        startedAt,
        pipelineMode: "regions",
        slice: false,
        agentIds: activeAgents,
      });
    } else {
      const slice = isPipelineSliceMode();
      const sliceTopics = slice ? getSliceTopicIds() : undefined;
      const out = await runTopicsPipeline(registry);
      writeOutputs(out.json, out.html, out.text, {
        runId,
        startedAt,
        pipelineMode: "topics",
        slice,
        sliceTopics,
        agentIds: activeAgents,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isRunHistoryEnabled()) {
      ensureRunHistoryFileExists();
      appendRunRecord({
        runId,
        kind: "pipeline",
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failure",
        pipelineMode: mode === "regions" ? "regions" : "topics",
        slice: mode !== "regions" && isPipelineSliceMode(),
        sliceTopics:
          mode !== "regions" && isPipelineSliceMode() ? getSliceTopicIds() : undefined,
        agentIds: activeAgents,
        error: msg,
      });
    }
    pipelineEmit("pipeline", runId, `Fatal: ${msg}`, "pipeline_failure", { error: msg });
    console.error("[pipeline] Fatal", e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[pipeline] Fatal", e);
  process.exit(1);
});
