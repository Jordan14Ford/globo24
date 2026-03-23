/**
 * **Phase 4 — run history, artifacts metadata, structured log fields**
 *
 * Persisted in `data/run-history.json` (or `RUN_HISTORY_PATH`). Not committed to git.
 *
 * @see docs/PHASE4_RUN_HISTORY.md
 */

import type { DigestEmailProvider } from "./schedule";
import type { AgentId } from "./agent";
import type { SendMode } from "./send";

export type RunKind = "pipeline" | "send" | "orchestrate";

export interface RunHistoryRecord {
  runId: string;
  kind: RunKind;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failure";
  /** topics | regions */
  pipelineMode?: string;
  orchestrateMode?: string;
  slice?: boolean;
  sliceTopics?: string[];
  agentIds?: AgentId[];
  error?: string;
  /** Repo-relative directory when artifacts snapshot ran, e.g. `data/runs/<runId>` */
  artifactsRelPath?: string;
  provider?: DigestEmailProvider;
  sendMode?: SendMode;
  messageId?: string;
  slotKey?: string;
}

export interface RunHistoryFile {
  version: 1;
  records: RunHistoryRecord[];
}
