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
const crypto = require("crypto");
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

// Round 50: eBay Sell API (Phase 2 of the team-lot listing helper) -- lets Bench create a DRAFT
// eBay listing straight from a Bundling pack instead of just handing Kaleb copy-paste text. Same
// "no key, clear error, nothing crashes" shape as the Anthropic key above. EBAY_ENV defaults to
// "sandbox" on purpose -- this only ever talks to Production if that's deliberately flipped once
// everything's been proven out safely.
const EBAY_ENV = process.env.EBAY_ENV || "sandbox";
const EBAY_APP_ID = process.env.EBAY_APP_ID || "";
const EBAY_CERT_ID = process.env.EBAY_CERT_ID || "";
const EBAY_RUNAME = process.env.EBAY_RUNAME || "";
const EBAY_OAUTH_BASE = EBAY_ENV === "production" ? "https://auth.ebay.com" : "https://auth.sandbox.ebay.com";
const EBAY_API_BASE = EBAY_ENV === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
const EBAY_SCOPES = ["https://api.ebay.com/oauth/api_scope/sell.inventory"];
const EBAY_CONFIGURED = !!(EBAY_APP_ID && EBAY_CERT_ID && EBAY_RUNAME);
// Root folder Bulk Auto-Import is allowed to read from -- bind-mount your actual scan folder to
// this path (see docker-compose.yml's IMPORT_DIR). Deliberately a single fixed root rather than
// letting the browser pass an arbitrary filesystem path: the frontend only ever supplies a name
// *relative* to this root, checked against path traversal in bulk-import.js.
const IMPORT_ROOT = path.resolve(process.env.IMPORT_ROOT || "/data/import");
fs.mkdirSync(IMPORT_ROOT, { recursive: true });

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Card photo files live alongside card-ledger.db, so they're covered by the same bind mount
// (and therefore the same backup coverage) with zero docker-compose changes.
const PHOTOS_DIR = path.join(path.dirname(DB_PATH), "photos");
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

// Inlined rather than required from a separate photo-store.js module: only server.js,
// bulk-import.js, and public/ are live-mounted into the container (see docker-compose.yml) --
// an extra standalone file has no deploy path without an image rebuild, so this stays
// self-contained here. (scripts/migrate-photos-to-files.js, run as a one-off outside the
// container, still uses the standalone photo-store.js -- kept in sync by hand, small enough
// that drift is easy to catch.)
const PHOTO_URL_RE = /^\/photos\/([0-9a-f-]{36})\.jpg(?:\?.*)?$/;
async function savePhotoFile(dataUrl, previousUrl) {
  if (!dataUrl) return null;
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error("savePhotoFile expected a data:image/... base64 URL");
  const reuseMatch = typeof previousUrl === "string" ? PHOTO_URL_RE.exec(previousUrl) : null;
  const id = reuseMatch ? reuseMatch[1] : crypto.randomUUID();
  const buffer = Buffer.from(match[1], "base64");
  await fs.promises.writeFile(path.join(PHOTOS_DIR, `${id}.jpg`), buffer);
  return `/photos/${id}.jpg?v=${Date.now()}`;
}

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

// --- eBay OAuth (Sell API) ----------------------------------------------------------------
// The refresh token (and a cached access token) ride in the same kv table as everything else --
// no new storage mechanism, no new file to lose track of. One connected eBay account for the
// whole app, same as there's one Anthropic key for the whole app; fine for a single-seller
// self-hosted tool.
function getEbayTokens() {
  const row = getStmt.get("ebay-oauth-tokens");
  return row ? JSON.parse(row.value) : null;
}
function setEbayTokens(tokens) {
  setStmt.run("ebay-oauth-tokens", JSON.stringify(tokens));
}

// Returns a currently-valid access token, refreshing it first if it's missing or close to
// expiring. Throws if eBay hasn't been connected yet (no refresh token on file) or if the
// refresh itself fails (e.g. the Sandbox account's consent was revoked) -- callers turn that
// into a normal JSON error response rather than letting it bubble up as a 500.
async function getValidEbayAccessToken() {
  const tokens = getEbayTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error("eBay isn't connected yet. Go to Bundling and click \"Connect eBay account\" first.");
  }
  if (tokens.access_token && tokens.access_token_expires_at && Date.now() < tokens.access_token_expires_at - 60000) {
    return tokens.access_token;
  }
  const basicAuth = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString("base64");
  const resp = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      scope: EBAY_SCOPES.join(" "),
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error_description || data.error || "eBay rejected the refresh token -- try reconnecting your eBay account.");
  }
  const updated = { ...tokens, access_token: data.access_token, access_token_expires_at: Date.now() + data.expires_in * 1000 };
  setEbayTokens(updated);
  return updated.access_token;
}

app.get("/api/ebay/status", (req, res) => {
  const tokens = getEbayTokens();
  res.json({ configured: EBAY_CONFIGURED, connected: !!(tokens && tokens.refresh_token), env: EBAY_ENV });
});

app.get("/api/ebay/connect", (req, res) => {
  if (!EBAY_CONFIGURED) {
    return res
      .status(400)
      .send(
        "eBay isn't configured on this server yet. Set EBAY_APP_ID, EBAY_CERT_ID, and EBAY_RUNAME in the stack's environment variables in Portainer and redeploy, then try again."
      );
  }
  // eBay's OAuth quirk: the redirect_uri parameter here is the RuName itself (an opaque
  // identifier eBay maps internally to the accept/decline URLs configured on the Application
  // Keys page), not a literal URL -- see https://developer.ebay.com/api-docs/static/oauth-credentials.html
  const authorizeUrl = new URL(`${EBAY_OAUTH_BASE}/oauth2/authorize`);
  authorizeUrl.searchParams.set("client_id", EBAY_APP_ID);
  authorizeUrl.searchParams.set("redirect_uri", EBAY_RUNAME);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", EBAY_SCOPES.join(" "));
  res.redirect(authorizeUrl.toString());
});

app.get("/api/ebay/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("eBay didn't send back an authorization code. Close this tab and try connecting again from Bench.");
  }
  try {
    const basicAuth = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString("base64");
    const resp = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: EBAY_RUNAME }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error_description || data.error || "eBay rejected the authorization code.");
    setEbayTokens({
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      access_token_expires_at: Date.now() + data.expires_in * 1000,
    });
    res.send("<h2>eBay account connected.</h2><p>You can close this tab and go back to Bench.</p>");
  } catch (err) {
    console.error("eBay OAuth callback failed:", err);
    res.status(500).send(`Connecting to eBay failed: ${String((err && err.message) || err)}. Close this tab and try again from Bench.`);
  }
});

// --- photo file storage ------------------------------------------------------------------
// Card photos are saved as raw JPEG files (see photo-store.js) instead of being embedded as
// base64 inside the card JSON -- keeps ordinary collection saves small and lets photos be
// lazy-loaded/cached by the browser instead of round-tripping on every save.
app.post("/api/photos", async (req, res) => {
  const dataUrl = req.body && typeof req.body.dataUrl === "string" ? req.body.dataUrl : null;
  const previousUrl = req.body && typeof req.body.previousUrl === "string" ? req.body.previousUrl : null;
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: { message: "Expected a data:image/... base64 URL." } });
  }
  try {
    const url = await savePhotoFile(dataUrl, previousUrl);
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: { message: String((err && err.message) || err) } });
  }
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
  savePhotoFile,
});

// --- static frontend -----------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));
// Photo files, served straight off disk. Every URL points at an immutable uuid+cache-buster
// (see photo-store.js), so a long max-age is safe -- a rotate/replace mints a new ?v= rather
// than reusing a cached one.
app.use("/photos", express.static(PHOTOS_DIR, { maxAge: "365d" }));
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
  console.log(EBAY_CONFIGURED ? `eBay API: configured (${EBAY_ENV})` : "eBay API: NOT configured (eBay listing features disabled)");
});
