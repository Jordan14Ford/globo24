#!/usr/bin/env npx tsx
/**
 * Phase 1 orchestrator: Eastern send windows + send-history dedupe + existing pipeline/send.
 *
 * ORCHESTRATE_MODE:
 * - `auto` (default): only run inside 9:00–9:18 / 17:30–17:48 America/New_York
 * - `force`: skip time window; still dedupes on `YYYY-MM-DD-manual` unless SKIP_DEDUPE=1
 * - `dry-run`: log decision only, exit 0
 *
 * Phase 4: optional run history (`data/run-history.json`), `PIPELINE_LOG_FORMAT=json`.
 *
 * @see docs/PHASE1_ORCHESTRATION.md
 * @see docs/PHASE4_RUN_HISTORY.md
 */
import "./loadEnv";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendDigest } from "../lib/email/sendDigest";
import { decideSchedule } from "../lib/schedule/scheduleDecision";
import type { OrchestrateMode } from "../types/schedule";
import { isProceedDecision } from "../types/schedule";
import {
  appendSendRecord,
  ensureHistoryFileExists,
  getHistoryPath,
  hasSentForSlot,
} from "../lib/schedule/sendHistory";
import {
  appendRunRecord,
  ensureRunHistoryFileExists,
  isRunHistoryEnabled,
} from "../lib/run/runHistory";
import { getOrCreateRunId } from "../lib/run/runId";
import { emitJsonLog, getPipelineLogFormat } from "../lib/run/structuredLog";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function log(msg: string, extra?: unknown): void {
  if (getPipelineLogFormat() === "json") {
    emitJsonLog({
      component: "orchestrate",
      event: "log",
      message: msg,
      ...(extra !== undefined ? { data: extra } : {}),
    });
    return;
  }
  if (extra !== undefined) console.log("[orchestrate]", msg, extra);
  else console.log("[orchestrate]", msg);
}

function parseMode(): OrchestrateMode {
  const m = (process.env.ORCHESTRATE_MODE ?? "auto").toLowerCase().trim();
  if (m === "force" || m === "dry-run" || m === "auto") return m;
  log(`WARN: unknown ORCHESTRATE_MODE=${m}, using auto`);
  return "auto";
}

async function main(): Promise<void> {
  const mode = parseMode();
  const historyPath = getHistoryPath();
  log(`mode=${mode} historyFile=${historyPath}`);

  if (mode !== "dry-run") {
    ensureHistoryFileExists(historyPath);
    if (isRunHistoryEnabled()) ensureRunHistoryFileExists();
  }

  if (mode === "dry-run") {
    const d = decideSchedule("dry-run");
    log("decision", d);
    process.exit(0);
  }

  const decision = decideSchedule(mode === "force" ? "force" : "auto");

  if (!isProceedDecision(decision)) {
    log(`SKIP — ${decision.reason}`);
    process.exit(0);
  }

  const skipDedupe = process.env.SKIP_DEDUPE === "1" || process.env.SKIP_DEDUPE === "true";
  if (!skipDedupe && hasSentForSlot(decision.slotKey, historyPath)) {
    log(`SKIP — duplicate send already recorded for slotKey=${decision.slotKey}`);
    process.exit(0);
  }

  const runId = getOrCreateRunId();
  const startedAt = new Date().toISOString();

  log(`PROCEED — ${decision.reason}`);
  log(`slotKey=${decision.slotKey} slot=${decision.slot} slotDate=${decision.slotDate}`);

  try {
    execSync("npm run pipeline", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, PIPELINE_RUN_ID: runId, PIPELINE_SLOT: decision.slot },
    });

    // Make slot available to sendDigest for subject line
    process.env.PIPELINE_SLOT = decision.slot;
    const sendResult = await sendDigest(ROOT);

    if (sendResult.delivered) {
      appendSendRecord(
        {
          slotKey: decision.slotKey,
          sentAt: new Date().toISOString(),
          provider: sendResult.provider,
          messageId: sendResult.messageId,
        },
        historyPath
      );
    } else {
      log(`NO-SEND — mode=${sendResult.mode}; send history not updated`);
    }

    if (isRunHistoryEnabled()) {
      appendRunRecord({
        runId,
        kind: "orchestrate",
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "success",
        orchestrateMode: mode,
        slotKey: decision.slotKey,
        sendMode: sendResult.mode,
        provider: sendResult.provider,
        messageId: sendResult.messageId,
      });
    }

    log("DONE — send recorded in send history");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isRunHistoryEnabled()) {
      appendRunRecord({
        runId,
        kind: "orchestrate",
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failure",
        orchestrateMode: mode,
        slotKey: decision.slotKey,
        error: msg,
      });
    }
    log(`FATAL — ${msg}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[orchestrate] FATAL", e);
  process.exit(1);
});
