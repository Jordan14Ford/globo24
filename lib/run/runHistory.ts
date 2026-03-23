/**
 * Append-only run history (pipeline / send / orchestrate) for Phase 4 observability.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RunHistoryFile, RunHistoryRecord } from "../../types/run";

export type { RunHistoryFile, RunHistoryRecord } from "../../types/run";

const DEFAULT_PATH = path.join(process.cwd(), "data", "run-history.json");
const DEFAULT_MAX = 500;

export function getRunHistoryPath(): string {
  return process.env.RUN_HISTORY_PATH?.trim() || DEFAULT_PATH;
}

export function isRunHistoryEnabled(): boolean {
  const v = process.env.RUN_HISTORY?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

function maxRecords(): number {
  const n = Number(process.env.RUN_HISTORY_MAX_RECORDS ?? DEFAULT_MAX);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX;
}

function ensureDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

export function loadRunHistory(filePath: string = getRunHistoryPath()): RunHistoryFile {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as RunHistoryFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.records)) {
      return { version: 1, records: [] };
    }
    return parsed;
  } catch {
    return { version: 1, records: [] };
  }
}

export function appendRunRecord(
  record: RunHistoryRecord,
  filePath: string = getRunHistoryPath()
): void {
  if (!isRunHistoryEnabled()) return;
  const data = loadRunHistory(filePath);
  data.records.push(record);
  const cap = maxRecords();
  if (data.records.length > cap) {
    data.records = data.records.slice(-cap);
  }
  atomicWriteJson(filePath, data);
}

function atomicWriteJson(filePath: string, data: RunHistoryFile): void {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, filePath);
}

/** Create empty run history JSON if missing (e.g. CI cache later). */
export function ensureRunHistoryFileExists(filePath: string = getRunHistoryPath()): void {
  if (existsSync(filePath)) return;
  atomicWriteJson(filePath, { version: 1, records: [] });
}
