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
const Database = require("better-sqlite3");

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

app.listen(PORT, () => {
  console.log(`Card Ledger listening on port ${PORT}`);
  console.log(`Database file: ${DB_PATH}`);
  console.log(ANTHROPIC_API_KEY ? "Anthropic API key: configured" : "Anthropic API key: NOT set (AI features disabled)");
});
