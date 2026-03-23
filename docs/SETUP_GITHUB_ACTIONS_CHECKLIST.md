# GitHub Actions — chunked setup checklist

Use this to get **scheduled digests** live. Goals (from **[PHASE1_ORCHESTRATION.md](./PHASE1_ORCHESTRATION.md)** + **[ARCHITECTURE.md](./ARCHITECTURE.md)**):

| Goal | How it’s met |
|------|----------------|
| **Search → review → compile → deliver** | `npm run orchestrate` runs pipeline then Resend/SMTP ([`scripts/orchestrate.ts`](../scripts/orchestrate.ts)). |
| **9:00 & 5:30 PM US Eastern** | Orchestrator windows in [`lib/schedule/eastern.ts`](../lib/schedule/eastern.ts); workflow UTC crons approximate; code is the source of truth. |
| **No duplicate sends** | `data/send-history.json` + cache between runs ([`lib/schedule/sendHistory.ts`](../lib/schedule/sendHistory.ts)). |
| **Editorial email** | [`agents/brutalistEditor.ts`](../agents/brutalistEditor.ts) → `output/digest.html`. |
| **Safe sends in CI** | Live mode to `EMAIL_TO` from secrets (not `SEND_MODE=test`). |

---

## Phase 0 — Pick your Git layout (5 min)

GitHub only loads workflows from **`<repository-root>/.github/workflows/`**.

| Your situation | Action |
|----------------|--------|
| **Repo = only `global-news-pipeline`** (recommended) | Keep [`.github/workflows/global-news-digest.yml`](../.github/workflows/global-news-digest.yml). Push this folder as the repo root. |
| **Repo = whole `DC Vibecodathon` monorepo** | Use **`DC Vibecodathon/.github/workflows/global-news-digest.yml`**. Delete or ignore the nested `global-news-pipeline/.github/` copy in that repo to avoid confusion (GitHub ignores nested `.github` anyway). |

**If your machine’s git root is your home folder** (unrelated remote): create a **new** repo on GitHub, then either:

```bash
cd /path/to/global-news-pipeline
git init
git add .
git commit -m "Add global news pipeline"
git branch -M main
git remote add origin https://github.com/YOU/YOUR-REPO.git
git push -u origin main
```

…or use **GitHub → New repository → upload** the `global-news-pipeline` folder.

---

## Phase 1 — Push workflow to default branch (5 min)

- [ ] Workflow file is on **`main`** (or your default branch). **Scheduled workflows do not run** from inactive branches the same way; default branch is what matters.
- [ ] `package-lock.json` is committed (workflow runs `npm ci`).

---

## Phase 2 — Enable Actions (2 min)

- [ ] Repo **Settings → Actions → General**: allow **Actions** (not “Disable actions”).
- [ ] For **forks**: schedules may be disabled until the repo is active; for your own repo, usually fine.

---

## Phase 3 — Secrets & variables (10 min)

**Settings → Secrets and variables → Actions**

### Required secrets

| Secret | Example |
|--------|---------|
| `RESEND_API_KEY` | `re_...` from [resend.com/api-keys](https://resend.com/api-keys) |
| `EMAIL_FROM` | `Digest <onboarding@resend.dev>` or your verified domain sender |
| `EMAIL_TO` | Your inbox (comma-separated for multiple) |

### Optional secrets

| Secret | When |
|--------|------|
| `EMAIL_SUBJECT` | Omit to use default `Globo News 24` |
| `OPENAI_API_KEY` | Omit → keyword fallback (no OpenAI cost) |

### Optional variables (same settings page → **Variables**)

| Variable | Purpose |
|----------|---------|
| `PIPELINE_MODE` | `topics` (default) or `regions` |
| `OPENAI_MASTER_MODEL` | e.g. `gpt-4o-mini` |

See **[GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)** for the full table.

---

## Phase 4 — First manual run (5 min)

1. **Actions** tab → **Global News Pipeline Digest** → **Run workflow**.
2. Leave **force_run** checked (default) → **`ORCHESTRATE_MODE=force`** → runs **now**, bypasses 9am/5:30pm window.
3. Open the run log:
   - Expect **PROCEED**, pipeline logs, **`Sent via Resend`**, **DONE**.
4. Check inbox (and Resend dashboard for bounces).

**Second run same day** with force → expect **SKIP — duplicate** for `*-manual` slot (dedupe working).

---

## Phase 5 — Confirm schedule (passive)

- [ ] After merge to default branch, **scheduled** runs appear on the **Actions** tab (may take up to ~1 hour for first cron tick on new workflows).
- [ ] At **~9:00** and **~5:30 PM America/New_York**, a run should **PROCEED** inside the window; other UTC triggers should **SKIP** with “Not in send window” (normal).

---

## Phase 6 — Troubleshooting

| Symptom | Check |
|---------|--------|
| Workflow never listed | Workflow file path must be **repo root** `.github/workflows/*.yml`. |
| `npm ci` fails | Commit `package-lock.json`; use Node 20 (set in workflow). |
| Send fails | Secrets; Resend domain/`from` rules; **[RESEND.md](./RESEND.md)**. |
| Always SKIP | Expected outside ET windows for `auto`. Use **Run workflow** with **force** to test. |
| `gh` CLI errors | Run `gh auth login` (optional; UI works without CLI). |

---

## Reference docs

- **[PHASE1_ORCHESTRATION.md](./PHASE1_ORCHESTRATION.md)** — windows, dedupe, local tests  
- **[GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)** — secrets, crons, monorepo  
- **[PHASE8_OPERATOR_CONTROLS.md](./PHASE8_OPERATOR_CONTROLS.md)** — `SEND_MODE`, allowlist (mostly for local)  
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — pipeline stages  
