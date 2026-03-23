#!/usr/bin/env npx tsx
/**
 * **Deliver — send compiled digest to inbox**
 *
 * Reads `output/digest.html` (+ optional `digest.txt`) produced by `runPipeline.ts` and sends
 * a multipart email to the address(es) in **`EMAIL_TO`** (see `.env.example`).
 *
 * - If **`RESEND_API_KEY`** is set → [Resend](https://resend.com) API.
 * - Else if **`SMTP_HOST`** is set → SMTP via `nodemailer` (`SMTP_*` env vars).
 * - Else → throws (no implicit `localhost:587`; set Resend or SMTP explicitly).
 *
 * Run after pipeline: `npm run send` or `npm run run:all`.
 * For a **fresh** editorial digest + test send in one step: `npm run pipeline:test` (writes `output/digest.html` then `SEND_MODE=test`).
 *
 * Phase 4: optional run history (`data/run-history.json`).
 * Phase 5: respects `delivery.email` enabled-state in the central agent registry.
 *
 * @see docs/ARCHITECTURE.md
 * @see docs/RESEND.md
 * @see docs/PHASE4_RUN_HISTORY.md
 * @see docs/PHASE5_AGENT_REGISTRY.md
 */
import "./loadEnv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendDigest } from "../lib/email/sendDigest";
import {
  assertAgentEnabled,
  enabledAgentIds,
  ensureAgentRegistryFileExists,
  resolveAgentRegistry,
} from "../lib/agents/registry";
import {
  appendRunRecord,
  ensureRunHistoryFileExists,
  isRunHistoryEnabled,
} from "../lib/run/runHistory";
import { getOrCreateRunId } from "../lib/run/runId";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const runId = getOrCreateRunId();
  const startedAt = new Date().toISOString();
  ensureAgentRegistryFileExists();
  const registry = resolveAgentRegistry("topics");
  const activeAgents = enabledAgentIds(registry);
  try {
    assertAgentEnabled(
      registry,
      "delivery.email",
      "Enable via AGENT_ENABLE=delivery.email or agent-registry override file"
    );
    const result = await sendDigest(ROOT);
    if (isRunHistoryEnabled()) {
      ensureRunHistoryFileExists();
      appendRunRecord({
        runId,
        kind: "send",
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "success",
        agentIds: activeAgents,
        sendMode: result.mode,
        provider: result.provider,
        messageId: result.messageId,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isRunHistoryEnabled()) {
      ensureRunHistoryFileExists();
      appendRunRecord({
        runId,
        kind: "send",
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failure",
        agentIds: activeAgents,
        error: msg,
      });
    }
    console.error("[sendEmail]", msg);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[sendEmail] Fatal", e);
  process.exit(1);
});
