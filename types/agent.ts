/**
 * Phase 5 — central agent registry and enabled-state domain types.
 */

export type AgentId =
  | "topic.search"
  | "topic.master_review"
  | "topic.compile"
  | "topic.resolve_links"
  | "regions.search"
  | "regions.rank"
  | "regions.compile"
  | "delivery.email";

export type PipelineModeScope = "topics" | "regions" | "any";

export interface AgentRegistryEntry {
  id: AgentId;
  label: string;
  stage: "search" | "review" | "compile" | "deliver";
  mode: PipelineModeScope;
  enabledByDefault: boolean;
}

export interface AgentRegistryOverrideFile {
  version: 1;
  enabled: Partial<Record<AgentId, boolean>>;
}
