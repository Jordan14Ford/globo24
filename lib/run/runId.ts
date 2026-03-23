import { randomUUID } from "node:crypto";

/**
 * Stable id for one pipeline / send / orchestrate execution.
 * Parent can set `PIPELINE_RUN_ID` or `RUN_ID` before spawning `npm run pipeline`.
 */
export function getOrCreateRunId(): string {
  const fromEnv =
    process.env.PIPELINE_RUN_ID?.trim() ||
    process.env.RUN_ID?.trim();
  if (fromEnv) return fromEnv;
  return randomUUID();
}
