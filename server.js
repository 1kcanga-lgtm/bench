// Card Ledger self-hosted backend.
//
// Two jobs:
//   1. A tiny key/value store (SQLite) that stands in for the `window.storage` API the app
//      was originally written against -- this is where the card collection, checklist
//      progress, and in-progress Bulk Add batches actually live.
//   2. A proxy for calls to Anthropic's API, so the real API key stays on the server and is
//      never sent to the browser. The frontend's fetch-shim redirects every
//      https://api.anthropic.com/v1/messages call here automatically.
"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const compression = require("compression");
const Database = require("better-sqlite3");

// Round 42: keep the server alive when a single request goes wrong instead of taking every other
// in-flight job down with it. This app has no queueing/worker separation -- one Node process
// handles the storage API, the Anthropic proxy, AND the whole Bulk Auto-Import / Bundling
// identify pipeline (see bulk-import.js's tickAllJobs interval below). Diagnosed 2026-09-26: a
// 30-card Bundling upload got interrupted mid-transfer (flaky wifi, backgrounded tab, whatever --
// base64'd photos as one big JSON body means these requests can run long), and the incoming
// request stream firing its 'aborted' event mid-body-parse surfaced as an actual uncaught
// exception (`BadRequestError: request aborted`, thrown from inside the `raw-body` package that
// express.json() uses internally -- see node_modules/raw-body/index.js's onAborted) rather than
// a normal 400 response. With no safety net, Node's default behavior for an uncaught exception is
// to crash the whole process; Docker's restart policy then brings it straight back up, but
// everything that was mid-flight (every other job's identify progress, not just the one bad
// request) gets lost, and any request that lands during the few seconds it's restarting can see a
// stray non-JSON error page. This does NOT fix why an upload gets interrupted in the first place
// (worth trying a wired connection for a big multi-card upload in the meantime), but it stops one
// dropped connection from taking the entire app down.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception -- logging and staying up:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled promise rejection -- logging and staying up:", err);
});

const PORT = parseInt(process.env.PORT || "8080", 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "card-ledger.db");
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_VERSION = "2023-06-01";
// Root folder Bulk Auto-Import is allowed to read from -- bind-mount your actual scan folder to
// this path (see docker-compose.yml's IMPORT_DIR). Deliberately a single fixed root rather than
// letting the browser pass an arbitrary filesystem path: the frontend only ever supplies a name
// *relative* to this root, checked against path traversal in bulk-import.js.
const IMPORT_ROOT = path.resolve(process.env.IMPORT_ROOT || "/data/import");
fs.mkdirSync(IMPORT_ROOT, { recursive: true });

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const getStmt = db.prepare("SELECT value FROM kv WHERE key = ?");
const setStmt = db.prepare(`
  INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

const app = express();
// Round 37: gzip every response. The collection is fetched (and saved) as one giant JSON blob
// full of base64 photo data -- see the size-limit comment just below -- and none of it was being
// compressed in transit. This alone won't fix the underlying "one blob" architecture, but it's a
// real, immediately-actionable win: repeated JSON structure (field names, punctuation) compresses
// very well, so this should noticeably cut transfer time on every load/save without touching how
// the app stores data. Placed before every route so it also covers the static frontend files.
app.use(compression());
// Card photos travel as base64 data URLs, and every save currently uploads the WHOLE collection
// in one request (see the /api/storage/:key PUT handler below) -- so this limit has to stay
// ahead of total-collection size, not just one card's photos. Raised from 50mb after a real
// collection (99 cards) hit it and started failing every save with PayloadTooLargeError. This is
// a stopgap, not a real fix: a big enough collection will hit even a generous limit eventually,
// and every save re-uploading the entire collection's photos gets slower as it grows regardless
// of the cap. The real fix is storing each card as its own row instead of one giant JSON blob --
// worth doing before this number needs raising again.
app.use(express.json({ limit: "1024mb" }));

// --- storage API (backs window.storage in the app) -------------------------------------
app.get("/api/storage/:key", (req, res) => {
  const row = getStmt.get(req.params.key);
  res.json({ value: row ? row.value : null });
});

app.put("/api/storage/:key", (req, res) => {
  const value = req.body && typeof req.body.value === "string" ? req.body.value : "";
  setStmt.run(req.params.key, value);
  res.json({ ok: true });
});

// --- Anthropic proxy ---------------------------------------------------------------------
app.post("/api/anthropic/messages", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    // Shaped like a real Anthropic error response so the app's existing
    // `if (data.error) throw new Error(data.error.message)` handling just works, and the
    // message shows up directly in the app's own error banners.
    return res.status(400).json({
      error: {
        type: "not_configured",
        message:
          "No Anthropic API key is set on this server yet. Add ANTHROPIC_API_KEY to the stack's environment variables in Portainer and redeploy to enable card identification, appraisal, and price lookups.",
      },
    });
  }
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: { type: "proxy_error", message: String((err && err.message) || err) } });
  }
});

// --- Bulk Auto-Import (folder-of-folders -> identify -> auto-save, via Anthropic's Batch API) --
require("./bulk-import")(app, db, {
  importRoot: IMPORT_ROOT,
  getApiKey: () => ANTHROPIC_API_KEY,
  anthropicVersion: ANTHROPIC_VERSION,
});

// --- static frontend -----------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Round 42: Express's own default error handler renders a plain HTML page, and the frontend
// always expects JSON back from these calls -- that mismatch is the other half of the
// "Unexpected token '<', "<!DOCTYPE "... is not valid JSON" error (the uncaughtException handler
// above covers the case where a request dies badly enough to take the whole process down; this
// covers everything short of that, where Express would otherwise hand back HTML instead). Must be
// registered after every route/middleware above to actually catch their errors.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("Request error:", err);
  res.status((err && err.status) || 500).json({
    error: { message: (err && err.message) || "Something went wrong handling that request." },
  });
});

app.listen(PORT, () => {
  console.log(`Card Ledger listening on port ${PORT}`);
  console.log(`Database file: ${DB_PATH}`);
  console.log(ANTHROPIC_API_KEY ? "Anthropic API key: configured" : "Anthropic API key: NOT set (AI features disabled)");
});
