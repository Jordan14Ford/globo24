# Phase 6 — Admin UI foundation

Phase 6 adds a lightweight local admin UI for operating the pipeline with four sections:

- **Overview**: run counts and latest run rows
- **Agents**: enable/disable agent overrides (`data/agent-registry.json`)
- **Runs**: recent run-history rows (`data/run-history.json`)
- **Settings**: persisted admin defaults (`data/admin-settings.json`)

## Entry points

- UI server: `npm run admin`
- URL: `http://localhost:8787` (or `ADMIN_PORT`)

Implementation:

- API + static hosting: [`scripts/adminServer.ts`](../scripts/adminServer.ts)
- UI: [`admin/index.html`](../admin/index.html)
- Settings store: [`lib/admin/settingsStore.ts`](../lib/admin/settingsStore.ts)

## API surface

- `GET /api/overview`
- `GET /api/agents`
- `POST /api/agents/toggle` `{ id, enabled }`
- `GET /api/runs`
- `GET /api/settings`
- `POST /api/settings` (partial settings payload)

## Persistence files

- `data/agent-registry.json` (Phase 5)
- `data/run-history.json` (Phase 4)
- `data/admin-settings.json` (Phase 6)

All are git-ignored.

## Environment

| Variable | Description |
|----------|-------------|
| `ADMIN_PORT` | Admin server port (default `8787`) |
| `ADMIN_SETTINGS_PATH` | Settings file path (default `./data/admin-settings.json`) |

## Verification

```bash
npx tsc --noEmit
npm run admin
# open http://localhost:8787
```

Then verify:

1. **Overview** loads without errors.
2. **Agents** toggle updates persist after refresh.
3. **Runs** table shows history rows.
4. **Settings** save and survive server restart.
