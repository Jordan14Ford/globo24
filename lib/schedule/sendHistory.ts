/**
 * Persisted send history for idempotent sends (duplicate prevention per slotKey).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SendHistoryFile, SendHistoryRecord } from "../../types/schedule";

export type { SendHistoryFile, SendHistoryRecord } from "../../types/schedule";

const DEFAULT_PATH = path.join(process.cwd(), "data", "send-history.json");

export function getHistoryPath(): string {
  return process.env.SEND_HISTORY_PATH?.trim() || DEFAULT_PATH;
}

/** Create empty history JSON if missing (so CI cache steps always have a path). */
export function ensureHistoryFileExists(filePath: string = getHistoryPath()): void {
  if (existsSync(filePath)) return;
  atomicWriteJson(filePath, { version: 1, records: [] });
}

function ensureDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

export function loadSendHistory(filePath: string = getHistoryPath()): SendHistoryFile {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as SendHistoryFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.records)) {
      return { version: 1, records: [] };
    }
    return parsed;
  } catch {
    return { version: 1, records: [] };
  }
}

export function hasSentForSlot(slotKey: string, filePath: string = getHistoryPath()): boolean {
  const data = loadSendHistory(filePath);
  return data.records.some((r) => r.slotKey === slotKey);
}

export function appendSendRecord(
  record: SendHistoryRecord,
  filePath: string = getHistoryPath()
): void {
  const data = loadSendHistory(filePath);
  data.records.push(record);
  atomicWriteJson(filePath, data);
}

function atomicWriteJson(filePath: string, data: SendHistoryFile): void {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, filePath);
}
