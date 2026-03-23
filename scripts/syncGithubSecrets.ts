#!/usr/bin/env npx tsx
/**
 * Push selected env vars from `.env` to GitHub Actions secrets for this repo.
 * Requires: `gh auth login` with `workflow` scope; `.env` with keys below.
 *
 * Usage:
 *   npx tsx scripts/syncGithubSecrets.ts
 *   npx tsx scripts/syncGithubSecrets.ts --repo Jordan14Ford/globo24
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(ROOT, ".env") });

const REQUIRED = ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_TO"] as const;
const OPTIONAL = ["EMAIL_SUBJECT", "OPENAI_API_KEY"] as const;

function parseArgs(): { repo: string } {
  const i = process.argv.indexOf("--repo");
  if (i >= 0 && process.argv[i + 1]) {
    return { repo: process.argv[i + 1]! };
  }
  const remote = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf-8",
    cwd: ROOT,
  });
  if (remote.status === 0) {
    const url = remote.stdout.trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
    if (m) return { repo: m[1]! };
  }
  return { repo: "Jordan14Ford/globo24" };
}

function setSecret(repo: string, name: string, value: string): void {
  const r = spawnSync("gh", ["secret", "set", name, "--repo", repo, "--body", value], {
    encoding: "utf-8",
    cwd: ROOT,
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `gh secret set ${name} failed`);
    process.exit(1);
  }
}

function main(): void {
  const { repo } = parseArgs();
  console.log(`[syncGithubSecrets] Repository: ${repo}`);

  for (const k of REQUIRED) {
    const v = process.env[k]?.trim();
    if (!v) {
      console.error(`[syncGithubSecrets] Missing ${k} in .env`);
      process.exit(1);
    }
    setSecret(repo, k, v);
    console.log(`[syncGithubSecrets] Set secret: ${k}`);
  }

  for (const k of OPTIONAL) {
    const v = process.env[k]?.trim();
    if (v) {
      setSecret(repo, k, v);
      console.log(`[syncGithubSecrets] Set secret: ${k}`);
    }
  }

  console.log("[syncGithubSecrets] Done. Run: gh workflow run 'Global News Pipeline Digest' --repo " + repo);
}

main();
