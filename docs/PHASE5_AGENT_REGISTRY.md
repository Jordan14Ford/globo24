# Phase 5 — Agent registry + enabled state

Phase 5 introduces a central registry for pipeline/delivery agents and a unified way to enable/disable them for local runs and CI.

## Registry model

- **Domain types:** [`types/agent.ts`](../types/agent.ts)
- **Resolver/service:** [`lib/agents/registry.ts`](../lib/agents/registry.ts)

Registered ids:

- `topic.search`
- `topic.master_review`
- `topic.compile`
- `topic.resolve_links`
- `regions.search`
- `regions.rank`
- `regions.compile`
- `delivery.email`

## Resolution order (highest last)

1. Built-in defaults (`enabledByDefault: true` for all agents)
2. File overrides from `data/agent-registry.json` (or `AGENT_REGISTRY_PATH`)
3. `AGENT_ENABLE` (comma-separated ids)
4. `AGENT_DISABLE` (comma-separated ids)

`AGENT_DISABLE` wins when the same id appears in both env lists.

## Runtime behavior

### `npm run pipeline`

`scripts/runPipeline.ts` now resolves the registry at startup and enforces mode-specific required agents:

- **topics mode** requires:
  - `topic.search`
  - `topic.master_review`
  - `topic.compile`
- **regions mode** requires:
  - `regions.search`
  - `regions.rank`
  - `regions.compile`

Optional behavior:

- `topic.resolve_links` controls post-curation URL resolution (`resolveGoogleNewsUrls`). If disabled, pipeline continues with a warning.

### `npm run send`

`scripts/sendEmail.ts` requires `delivery.email`; if disabled it exits with a clear error and records a failed `send` run-history row (if run-history is enabled).

## Persistence

`ensureAgentRegistryFileExists()` bootstraps `data/agent-registry.json` as:

```json
{
  "version": 1,
  "enabled": {}
}
```

This file is intentionally git-ignored so each environment can control agents independently.

## Observability linkage

Phase 4 run-history rows now include `agentIds` (resolved enabled ids for the current mode), helping explain why stages ran/skipped.

## Environment

| Variable | Description |
|----------|-------------|
| `AGENT_REGISTRY_PATH` | Override path for the registry override file (default `./data/agent-registry.json`). |
| `AGENT_ENABLE` | Comma-separated ids to force-enable for this run. |
| `AGENT_DISABLE` | Comma-separated ids to force-disable for this run. |

See [`.env.example`](../.env.example).

## Verification

```bash
npx tsc --noEmit

# Disable optional link resolver (pipeline still succeeds)
AGENT_DISABLE=topic.resolve_links npm run pipeline

# Disable required topic stage (pipeline fails fast)
AGENT_DISABLE=topic.master_review npm run pipeline

# Disable delivery (send fails fast)
AGENT_DISABLE=delivery.email npm run send
```
