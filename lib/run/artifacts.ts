/**
 * Copy `output/` into `data/runs/<runId>/` for Phase 4 artifact retention.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export function isArtifactSnapshotEnabled(): boolean {
  const v = process.env.RUN_ARTIFACTS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Returns repo-relative path `data/runs/<runId>` or undefined if skipped / missing output. */
export function snapshotOutputToRunDir(runId: string, repoRoot: string): string | undefined {
  if (!isArtifactSnapshotEnabled()) return undefined;
  const outDir = path.join(repoRoot, "output");
  if (!existsSync(outDir)) return undefined;

  const dest = path.join(repoRoot, "data", "runs", runId);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(outDir, dest, { recursive: true });
  return path.join("data", "runs", runId);
}
