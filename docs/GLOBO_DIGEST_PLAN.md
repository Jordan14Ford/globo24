# Globo News 24 — discovery roadmap

> Planning doc: where the digest is going after RSS-first ingestion.

## Current state (2026)

- **Ingestion** is driven mainly by **RSS** (Google News topic queries plus allowlisted publisher feeds per pillar).
- **Curation** is a single **master agent** pass over normalized candidates (OpenAI or keyword fallback).
- **Regional / continent pipeline** is **retired** — production runs **topics-only** (`PIPELINE_MODE=topics`).

## Goal: look beyond RSS

RSS stays useful for volume and structure, but many outlets publish first on the **open web** (section fronts, topic hubs, paywalled or partial feeds). The next evolution is to **pull candidate stories from websites and site sections** that match Globo’s interest model, then run the **same** normalization + curation + editorial compile path.

### Interest model (unchanged pillars)

Stories should still map to the four pillars and reader profile: **tech**, **geopolitics**, **macro**, **economics** — senior macro reader, not tabloid noise.

### Discovery layers (planned)

1. **Allowlisted site maps** — For each trusted domain, maintain a list of **entry URLs** (homepage, `/markets`, `/world`, `/technology`, etc.). Fetch HTML or JSON indexes where available.
2. **Article extraction** — For each candidate URL, extract title, canonical link, dek/summary, published time, and hero image (readability-style or site-specific rules). Respect `robots.txt` and rate limits.
3. **Fit scoring** — Lightweight classifier (rules + small model) assigns pillar + quality score; discard off-topic or duplicate URLs (dedupe against RSS pool and prior sends).
4. **Merge with RSS** — Web candidates join the same per-topic pools `topicAgent` already feeds into `masterAgent`, so the master step stays one coherent editorial pass.

### Non-goals (for now)

- Arbitrary web search without domain allowlists (spam and SEO risk).
- Replacing the master curator with per-article LLM calls at scale (cost and inconsistency).

### Operational notes

- **Secrets**: site-specific keys (if any) live in `.env` / GitHub Secrets; no keys in repo.
- **Scheduling**: unchanged — orchestrator + Eastern windows + Resend delivery.

This document should be updated as implementation lands (e.g. new `config/webSources.ts`, fetcher module, and tests).
