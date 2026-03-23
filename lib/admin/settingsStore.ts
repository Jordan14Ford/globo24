import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AdminSettings, AdminSettingsFile } from "../../types/admin";

const DEFAULT_PATH = path.join(process.cwd(), "data", "admin-settings.json");

const DEFAULT_SETTINGS: AdminSettings = {
  pipelineModeDefault: "topics",
  orchestrateModeDefault: "auto",
  logFormatDefault: "text",
  runHistoryEnabledDefault: true,
  runArtifactsEnabledDefault: false,
};

export function getAdminSettingsPath(): string {
  return process.env.ADMIN_SETTINGS_PATH?.trim() || DEFAULT_PATH;
}

function ensureDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function atomicWrite(filePath: string, data: AdminSettingsFile): void {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, filePath);
}

export function ensureAdminSettingsFileExists(filePath: string = getAdminSettingsPath()): void {
  if (existsSync(filePath)) return;
  atomicWrite(filePath, { version: 1, settings: DEFAULT_SETTINGS });
}

export function loadAdminSettings(filePath: string = getAdminSettingsPath()): AdminSettings {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as AdminSettingsFile;
    if (parsed?.version !== 1 || !parsed.settings) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...parsed.settings };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAdminSettings(
  settings: Partial<AdminSettings>,
  filePath: string = getAdminSettingsPath()
): AdminSettings {
  const current = loadAdminSettings(filePath);
  const next: AdminSettings = { ...current, ...settings };
  atomicWrite(filePath, { version: 1, settings: next });
  return next;
}
