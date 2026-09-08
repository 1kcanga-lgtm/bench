# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bench ("Card Ledger") is a self-hosted sports-card collection tracker: a single-page React app plus a small Express/SQLite backend, packaged to run as one Docker container. It was originally built for a sandboxed runtime that provided a global `window.storage` key/value API and transparently authenticated calls to `https://api.anthropic.com/v1/messages`. This repo makes it run in an ordinary browser/server without touching `src/card_ledger.jsx` at all, via two shims — see Architecture below.

## Commands

```bash
npm install       # first time only — pulls in esbuild/react for the frontend build
npm run build     # esbuild src/entry.jsx -> public/app.bundle.js (minified IIFE)
npm start         # node server.js — serves public/ and the API on $PORT (default 8080)
```

`public/app.bundle.js` is committed (not gitignored) — the Docker image does not build the frontend at all, it only ever runs the pre-built bundle. After editing `src/card_ledger.jsx`, always run `npm run build` before the change takes effect, and re-deploy `public/app.bundle.js` (see Deployment below).

There is no test suite, linter, or CI configured in this repo.

## Architecture

**Two shims bridge the original sandboxed-runtime API to a normal self-hosted stack** (`public/storage-shim.js`, `public/anthropic-fetch-shim.js`, both loaded before `app.bundle.js` in `index.html` — order matters):
- `window.storage.get/set(key)` → `GET`/`PUT /api/storage/:key`, backed by a single generic `kv` table in SQLite (`server.js`). The whole card collection round-trips as **one JSON blob** per save under `STORAGE_KEY` (`"card-ledger-entries"`) — every save re-uploads the entire collection, which is why `server.js` needed a large `express.json()` body limit as collections grow.
- Any `fetch("https://api.anthropic.com/v1/messages", ...)` call is intercepted client-side and rerouted to `/api/anthropic/messages`, a thin proxy in `server.js` that attaches the real `ANTHROPIC_API_KEY` server-side (never sent to the browser).

**Card images are never stored as separate files.** They're always embedded base64 JPEG data URLs — either inside the one JSON blob under `STORAGE_KEY`, or in dedicated columns on the bulk-import tables (`front_api`/`back_api`/`front_storage`/`back_storage`). The entire collection, including every photo, lives in one SQLite file (`card-ledger.db`, path from `$DB_PATH`).

**Frontend is one ~4,000-line file**, `src/card_ledger.jsx` — no component-file splitting. Top-level tabs (Gallery, Stars Checklist, Young Guns, Bulk Add, Auto Import, Appraise) are each a top-level component in that file (`BulkAddPanel`, `AutoImportPanel`, `AppraisePanel`, etc.).

**Bulk Auto-Import (`bulk-import.js`) is a separate CommonJS module** mounted onto the same Express app, because it needs to run server-side (survive a closed browser tab) and drive Anthropic's async **Batch API**. It owns its own SQLite tables (`bulk_jobs`, `bulk_job_items`, `bulk_review_items`) and a background tick loop (`setInterval`, every 45s) that submits pending items as batches, polls in-flight batch status, and finalizes results — auto-saving confident cards into the main ledger, routing low-confidence ones to a review queue.

**`bulk-import.js` intentionally duplicates constants and prompt text from `card_ledger.jsx`** — `MODEL_ID`, `PRICING`, `WEB_SEARCH_COST_USD`, the `FIELDS_SCHEMA*` shapes, `identifyPromptOne`/`identifyPromptTwoUnordered`, the `needsSearch()` escalation condition, and the `thinking: {type: "disabled"}` override on the no-search pass. This is because `bulk-import.js` is plain CommonJS and `card_ledger.jsx` is bundled ESM/JSX for the browser, so they can't share code directly. **Search both files for `KEEP IN SYNC`** before changing any of these — editing one without the other silently desyncs the interactive app from the batch pipeline (different prompt wording, stale pricing, etc.).

**Identify uses a two-pass strategy** to control cost: a cheap pass with no web search first; only escalate to a second, search-enabled pass (the `web_search_20250305` tool) if the result comes back low-confidence or missing a field the app depends on (`needsSearch()`). Most cards never pay for search at all. `claude-sonnet-5` defaults to **adaptive thinking on** when `thinking` is omitted (unlike `claude-sonnet-4-6`, where omitting it meant off) — the no-search pass and `callAppraiseOnce` explicitly set `thinking: {type: "disabled"}` since it's plain extraction with no reasoning benefit; the search-enabled escalation pass is left on adaptive-default since harder cards may benefit from it.

## Deployment

Ships as one Docker image (`Dockerfile`) that only installs backend deps (`--omit=dev`, no frontend build tools) and runs `node server.js`. `docker-compose.yml` live-mounts `public/`, `server.js`, and `bulk-import.js` from a host path (`$APP_DIR`, default `/opt/bench-app`) rather than baking them into the image — so an ordinary code change is just overwriting the file on disk and `docker restart bench` (no rebuild). Adding a new dependency (like `sharp` for image resizing) is the one case that needs a full image rebuild.

The database (`$DATA_DIR`, default `/opt/bench-data`) is a plain bind-mounted path rather than a Docker-managed named volume, specifically so it lands somewhere ordinary backup tooling (e.g. an Unraid appdata backup) already covers — that's also where every card photo lives, embedded in `card-ledger.db`.

Environment variable changes (`ANTHROPIC_API_KEY`, `APP_DIR`, `DATA_DIR`, `IMPORT_DIR`, `HOST_PORT`) require recreating the container (`docker compose up -d`), not just restarting it — Compose only re-reads env vars at container creation.

## Kaleb's deployment (operational facts, not derivable from the code)

- Live at `bench.mackgreen.com`, container name `bench`, on an Unraid host (`Kandor`), managed by plain `docker compose` directly over SSH — **not** Portainer, despite the compose file's comments assuming Portainer.
- Compose files live at `/mnt/user/appdata/bench/`. **The Compose project name is `bench-stack`, not `bench`** (the default Compose would infer from that directory name) — always run `docker compose -p bench-stack ...` here, or Compose creates a second, colliding container/volume set instead of recognizing the existing one.
- Container must be attached to the pre-existing external network `proxynet` (the reverse proxy that serves the `mackgreen.com` domain lives there) — declared in `docker-compose.yml` under `networks: proxynet: { external: true }`, with the `bench` service joining it.
- `DATA_DIR=/mnt/user/appdata/bench/data` (bind mount) and `HOST_PORT=8091` are both set in `/mnt/user/appdata/bench/.env` (gitignored). The database previously lived in a Docker-managed named volume (`bench-stack_bench-data`) that sat outside the appdata folder and outside the offsite backup's coverage — it was migrated to the bind-mounted path for exactly that reason; the old named volume can be removed once the bind-mounted copy is confirmed working.
- Real-world measured cost from a 36-card Auto Import batch: ~$0.0043/card average (Batch API pricing, i.e. already at the 50% discount).
