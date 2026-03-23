#!/usr/bin/env npx tsx
import "./loadEnv";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_AGENT_REGISTRY,
  ensureAgentRegistryFileExists,
  getAgentRegistryPath,
  loadAgentRegistryOverrides,
  resolveAgentRegistry,
  setAgentEnabledOverride,
} from "../lib/agents/registry";
import { loadRunHistory } from "../lib/run/runHistory";
import { loadDigestRecords, loadStoryRecords } from "../lib/content/contentStore";
import {
  ensureAdminSettingsFileExists,
  loadAdminSettings,
  saveAdminSettings,
} from "../lib/admin/settingsStore";
import type { AgentId } from "../types/agent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const UI_FILE = path.join(ROOT, "admin", "index.html");

type Json = Record<string, unknown>;

function sendJson(res: ServerResponse, statusCode: number, payload: Json): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res: ServerResponse): void {
  const html = readFileSync(UI_FILE, "utf-8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function readJsonBody(req: IncomingMessage): Promise<Json> {
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c.toString()));
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw) as Json);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function normalizeBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";

    if (method === "GET" && (url.pathname === "/" || url.pathname === "/admin")) {
      return sendHtml(res);
    }

    if (method === "GET" && url.pathname === "/api/overview") {
      const runHistory = loadRunHistory();
      const latest = runHistory.records.slice(-20).reverse();
      const counts = {
        total: runHistory.records.length,
        success: runHistory.records.filter((r) => r.status === "success").length,
        failure: runHistory.records.filter((r) => r.status === "failure").length,
      };
      return sendJson(res, 200, { counts, latest });
    }

    if (method === "GET" && url.pathname === "/api/agents") {
      ensureAgentRegistryFileExists();
      const file = loadAgentRegistryOverrides();
      const resolvedTopics = resolveAgentRegistry("topics");
      const resolvedRegions = resolveAgentRegistry("regions");
      const rows = DEFAULT_AGENT_REGISTRY.map((a) => ({
        ...a,
        override: file.enabled[a.id],
        enabledTopics: resolvedTopics.byId[a.id],
        enabledRegions: resolvedRegions.byId[a.id],
      }));
      return sendJson(res, 200, {
        filePath: getAgentRegistryPath(),
        agents: rows,
      });
    }

    if (method === "POST" && url.pathname === "/api/agents/toggle") {
      const body = await readJsonBody(req);
      const id = body.id;
      const enabled = normalizeBool(body.enabled);
      if (typeof id !== "string" || enabled === undefined) {
        return sendJson(res, 400, { error: "Expected { id: string, enabled: boolean }" });
      }
      const valid = DEFAULT_AGENT_REGISTRY.some((a) => a.id === id);
      if (!valid) return sendJson(res, 400, { error: `Unknown agent id: ${id}` });
      setAgentEnabledOverride(id as AgentId, enabled);
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && url.pathname === "/api/runs") {
      const runHistory = loadRunHistory();
      return sendJson(res, 200, {
        total: runHistory.records.length,
        rows: runHistory.records.slice(-200).reverse(),
      });
    }

    if (method === "GET" && url.pathname === "/api/stories") {
      const rows = loadStoryRecords().slice(-500).reverse();
      return sendJson(res, 200, { total: rows.length, rows });
    }

    if (method === "GET" && url.pathname === "/api/digests") {
      const rows = loadDigestRecords().slice(-300).reverse();
      return sendJson(res, 200, { total: rows.length, rows });
    }

    if (method === "GET" && url.pathname === "/api/settings") {
      ensureAdminSettingsFileExists();
      return sendJson(res, 200, loadAdminSettings() as unknown as Json);
    }

    if (method === "POST" && url.pathname === "/api/settings") {
      const body = await readJsonBody(req);
      const updated = saveAdminSettings({
        pipelineModeDefault:
          body.pipelineModeDefault === "regions" ? "regions" : body.pipelineModeDefault === "topics" ? "topics" : undefined,
        orchestrateModeDefault:
          body.orchestrateModeDefault === "auto" ||
          body.orchestrateModeDefault === "force" ||
          body.orchestrateModeDefault === "dry-run"
            ? body.orchestrateModeDefault
            : undefined,
        logFormatDefault:
          body.logFormatDefault === "json" || body.logFormatDefault === "text"
            ? body.logFormatDefault
            : undefined,
        runHistoryEnabledDefault: normalizeBool(body.runHistoryEnabledDefault),
        runArtifactsEnabledDefault: normalizeBool(body.runArtifactsEnabledDefault),
      });
      return sendJson(res, 200, updated as unknown as Json);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return sendJson(res, 500, { error: msg });
  }
});

const port = Number(process.env.ADMIN_PORT ?? 8787);
server.listen(port, () => {
  console.log(`[admin] http://localhost:${port}`);
});
