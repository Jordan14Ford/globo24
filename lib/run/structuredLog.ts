/**
 * Optional JSON log lines when `PIPELINE_LOG_FORMAT=json` (operators / aggregators).
 */

export type PipelineLogFormat = "text" | "json";

export function getPipelineLogFormat(): PipelineLogFormat {
  const f = process.env.PIPELINE_LOG_FORMAT?.trim().toLowerCase();
  return f === "json" ? "json" : "text";
}

/** Emit one JSON line when `PIPELINE_LOG_FORMAT=json`; otherwise no-op. */
export function emitJsonLog(data: {
  component: string;
  runId?: string;
  event: string;
  message?: string;
  [key: string]: unknown;
}): void {
  if (getPipelineLogFormat() !== "json") return;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      ...data,
    })
  );
}

/**
 * Human-readable log in text mode; JSON line in JSON mode.
 */
export function pipelineEmit(
  component: string,
  runId: string | undefined,
  humanMessage: string,
  jsonEvent: string,
  extra?: Record<string, unknown>
): void {
  if (getPipelineLogFormat() === "json") {
    emitJsonLog({
      component,
      runId,
      event: jsonEvent,
      message: humanMessage,
      ...extra,
    });
    return;
  }
  const rid = runId ? ` [${runId.slice(0, 8)}]` : "";
  console.log(`[${component}]${rid} ${humanMessage}`);
}
