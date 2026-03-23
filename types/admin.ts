/**
 * Phase 6 — Admin UI foundation data models.
 */

export interface AdminSettings {
  pipelineModeDefault: "topics" | "regions";
  orchestrateModeDefault: "auto" | "force" | "dry-run";
  logFormatDefault: "text" | "json";
  runHistoryEnabledDefault: boolean;
  runArtifactsEnabledDefault: boolean;
}

export interface AdminSettingsFile {
  version: 1;
  settings: AdminSettings;
}
