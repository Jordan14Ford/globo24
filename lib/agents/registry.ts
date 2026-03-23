import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  AgentId,
  AgentRegistryEntry,
  AgentRegistryOverrideFile,
  PipelineModeScope,
} from "../../types/agent";

export type { AgentId, AgentRegistryEntry, AgentRegistryOverrideFile, PipelineModeScope } from "../../types/agent";

const DEFAULT_PATH = path.join(process.cwd(), "data", "agent-registry.json");

export const DEFAULT_AGENT_REGISTRY: AgentRegistryEntry[] = [
  { id: "topic.search", label: "Topic Search Agent", stage: "search", mode: "topics", enabledByDefault: true },
  { id: "topic.master_review", label: "Topic Master Review Agent", stage: "review", mode: "topics", enabledByDefault: true },
  { id: "topic.compile", label: "Topic Brutalist Compile Agent", stage: "compile", mode: "topics", enabledByDefault: true },
  { id: "topic.resolve_links", label: "Topic Link Resolver", stage: "compile", mode: "topics", enabledByDefault: true },
  { id: "regions.search", label: "Regional Search Agent", stage: "search", mode: "regions", enabledByDefault: true },
  { id: "regions.rank", label: "Regional Rank Agent", stage: "review", mode: "regions", enabledByDefault: true },
  { id: "regions.compile", label: "Regional Compile Agent", stage: "compile", mode: "regions", enabledByDefault: true },
  { id: "delivery.email", label: "Email Delivery Agent", stage: "deliver", mode: "any", enabledByDefault: true },
];

const AGENT_IDS = new Set(DEFAULT_AGENT_REGISTRY.map((a) => a.id));

export function getAgentRegistryPath(): string {
  return process.env.AGENT_REGISTRY_PATH?.trim() || DEFAULT_PATH;
}

function ensureDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function atomicWriteJson(filePath: string, data: AgentRegistryOverrideFile): void {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, filePath);
}

export function ensureAgentRegistryFileExists(filePath: string = getAgentRegistryPath()): void {
  if (existsSync(filePath)) return;
  atomicWriteJson(filePath, { version: 1, enabled: {} });
}

function parseAgentIdList(raw: string | undefined, envKey: string): AgentId[] {
  if (!raw?.trim()) return [];
  const ids: AgentId[] = [];
  for (const token of raw.split(",").map((t) => t.trim()).filter(Boolean)) {
    if (!AGENT_IDS.has(token as AgentId)) {
      console.warn(`[registry] ${envKey}: ignoring unknown agent id "${token}"`);
      continue;
    }
    ids.push(token as AgentId);
  }
  return ids;
}

function loadOverrideFile(filePath: string = getAgentRegistryPath()): AgentRegistryOverrideFile {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as AgentRegistryOverrideFile;
    if (parsed?.version !== 1 || typeof parsed.enabled !== "object" || !parsed.enabled) {
      return { version: 1, enabled: {} };
    }
    return parsed;
  } catch {
    return { version: 1, enabled: {} };
  }
}

export function loadAgentRegistryOverrides(
  filePath: string = getAgentRegistryPath()
): AgentRegistryOverrideFile {
  return loadOverrideFile(filePath);
}

export function saveAgentRegistryOverrides(
  data: AgentRegistryOverrideFile,
  filePath: string = getAgentRegistryPath()
): void {
  atomicWriteJson(filePath, data);
}

export function setAgentEnabledOverride(
  id: AgentId,
  enabled: boolean,
  filePath: string = getAgentRegistryPath()
): void {
  const next = loadOverrideFile(filePath);
  next.enabled[id] = enabled;
  atomicWriteJson(filePath, next);
}

function isAgentApplicable(mode: PipelineModeScope, runtimeMode: "topics" | "regions"): boolean {
  return mode === "any" || mode === runtimeMode;
}

export interface ResolvedAgentRegistry {
  runtimeMode: "topics" | "regions";
  byId: Record<AgentId, boolean>;
  enabledInMode: AgentRegistryEntry[];
}

/**
 * Merge order (last wins): defaults -> file overrides -> AGENT_ENABLE/AGENT_DISABLE envs.
 */
export function resolveAgentRegistry(runtimeMode: "topics" | "regions"): ResolvedAgentRegistry {
  const byId = Object.fromEntries(
    DEFAULT_AGENT_REGISTRY.map((a) => [a.id, a.enabledByDefault])
  ) as Record<AgentId, boolean>;

  const file = loadOverrideFile();
  for (const [rawId, enabled] of Object.entries(file.enabled)) {
    if (!AGENT_IDS.has(rawId as AgentId)) continue;
    if (typeof enabled === "boolean") {
      byId[rawId as AgentId] = enabled;
    }
  }

  for (const id of parseAgentIdList(process.env.AGENT_ENABLE, "AGENT_ENABLE")) {
    byId[id] = true;
  }
  for (const id of parseAgentIdList(process.env.AGENT_DISABLE, "AGENT_DISABLE")) {
    byId[id] = false;
  }

  return {
    runtimeMode,
    byId,
    enabledInMode: DEFAULT_AGENT_REGISTRY.filter(
      (a) => isAgentApplicable(a.mode, runtimeMode) && byId[a.id]
    ),
  };
}

export function isAgentEnabled(registry: ResolvedAgentRegistry, id: AgentId): boolean {
  return registry.byId[id] === true;
}

export function assertAgentEnabled(
  registry: ResolvedAgentRegistry,
  id: AgentId,
  guidance?: string
): void {
  if (isAgentEnabled(registry, id)) return;
  const extra = guidance ? ` ${guidance}` : "";
  throw new Error(`Agent disabled: ${id}.${extra}`);
}

export function enabledAgentIds(registry: ResolvedAgentRegistry): AgentId[] {
  return registry.enabledInMode.map((a) => a.id);
}
