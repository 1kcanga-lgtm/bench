// Bulk Auto-Import: point the server at a folder of subfolders (one subfolder per physical
// card, each containing that card's front and back photo), and it identifies, orients, and
// saves every card with no per-card review -- except for the minority the AI genuinely isn't
// confident about, which land in a small review queue instead of being saved or guessed.
//
// Runs entirely server-side (not in the browser) for two reasons: it has to survive Kaleb
// closing the tab or his PC sleeping for however long a run takes, and it uses Anthropic's
// Message Batches API (a real, official 50%-off-standard-pricing async processing mode) which
// is naturally a server-to-server thing, not something a browser tab should be polling for
// hours.
//
// IMPORTANT MAINTENANCE NOTE: the identify prompts, field schema, model id, and pricing table
// below are deliberately copied from card_ledger.jsx rather than shared via import, because
// this file is a plain CommonJS Node module and card_ledger.jsx is bundled as an ES module/JSX
// file for the browser. If the identify prompt, FIELDS_SCHEMA, MODEL_ID, or PRICING ever change
// in card_ledger.jsx, the matching copies here need the same edit or this pipeline will drift
// out of sync with what the interactive app does (different prompt wording, stale pricing,
// etc.). Search this file for "KEEP IN SYNC" to find every place that matters.
"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

// ---------------------------------------------------------------------------------------------
// KEEP IN SYNC with card_ledger.jsx: MODEL_ID, PRICING, WEB_SEARCH_COST_USD, FIELDS_SCHEMA*,
// identifyPromptOne/identifyPromptTwoUnordered, the "needs a second, search-enabled pass"
// condition in identifyCardFromImages, and the thinking:{type:"disabled"} override on the
// no-search pass in callIdentifyOnce.
// ---------------------------------------------------------------------------------------------
const MODEL_ID = "claude-sonnet-5";
const PRICING = { "claude-sonnet-5": { input: 2 / 1e6, output: 10 / 1e6 } };
const WEB_SEARCH_COST_USD = 0.01;
// The Message Batches API is a flat 50% discount off standard synchronous pricing for both
// tokens and web_search fees -- confirmed current on platform.claude.com/docs. Applied on top
// of the same per-call math the interactive app uses.
const BATCH_DISCOUNT = 0.5;

const SPORTS = ["Baseball", "Basketball", "Football", "Hockey", "Soccer", "Other"];

const FIELDS_SCHEMA_ONE = `"rotation":0,"player":"","team":"","sport":"","year":"","brand":"","set":"","cardNumber":"","confidence":"","estimatedValue":null,"frontImageUrl":null,"backImageUrl":null`;
const FIELDS_SCHEMA_TWO = `"frontImageIndex":1,"rotation1":0,"rotation2":0,"player":"","team":"","sport":"","year":"","brand":"","set":"","cardNumber":"","confidence":"","estimatedValue":null,"frontImageUrl":null,"backImageUrl":null`;

function identifyPromptOne(allowSearch) {
  const steps = [
    `Check the image's orientation: if the card is sideways or upside down, note how many degrees it must be rotated CLOCKWISE to appear upright (0, 90, 180, or 270).`,
    `Look at the image (mentally correcting for any rotation) and identify the card: player name, team, sport, year, card number, the manufacturer/brand (e.g. "Upper Deck", "Topps", "O-Pee-Chee", "Panini", "Score", "Leaf", "Parkhurst" -- whichever company actually printed this card), and the specific set/subset or parallel name separately from the brand (e.g. "Series 1", "Young Guns", "Update", "Chrome", "Black Diamond").`,
    `Any printed year or year-range text (e.g. copyright year, or a range like "89-90") is the single most important detail — read it character by character, very carefully. Do not guess a "round" or common-looking year instead of what is actually printed; double-check similar-looking digits (e.g. 8 vs 9, 0 vs 6) before answering.`,
  ];
  if (allowSearch) {
    steps.push(
      `Use web search sparingly -- a handful of well-chosen searches is enough; you don't need to exhaustively cross-check every source. Prefer the Trading Card Database (tcdb.com) as your primary source — it's the source this app's own checklists are built from, so matching its exact card number and set name keeps this card consistent with the checklist. Fall back to PSA, COMC, or eBay sold listings only if TCDB doesn't turn up the answer.`,
      `From your search, try to find a direct image URL for the front of this exact card, and separately for the back, from a page you actually found (a TCDB card-detail page is ideal). Only include a URL if it appeared in your search results — never invent or guess one. If you cannot confidently find one, use null.`,
      `If your search surfaced recent sale prices or listings for this exact card in typical condition, estimate a rough current market value in USD as a plain number (no currency symbol, no commas). If you have no reasonable basis, use null.`
    );
  } else {
    steps.push(
      `No live web search is available for this pass -- work from the image and your own general trading-card knowledge alone. Leave "frontImageUrl" and "backImageUrl" as null (there's nothing searched to find one from). Give "estimatedValue" a plain USD number only if you're reasonably confident from general knowledge; otherwise use null. If you're not confident about the exact card number or set/subset name, it's fine to answer "confidence":"low" or "medium" rather than guessing -- a second pass with live search will double-check anything uncertain.`
    );
  }
  steps.push(`Rate your overall confidence as "high", "medium", or "low".`);
  const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `You are helping identify a sports trading card from a single photo.

${numbered}

Respond with ONLY a raw JSON object, no markdown fences, no commentary, in exactly this shape:
{${FIELDS_SCHEMA_ONE}}

"rotation" is the clockwise degrees (0, 90, 180, or 270) needed to make the image upright. "sport" must be one of: Baseball, Basketball, Football, Hockey, Soccer, Other. "brand" should be just the manufacturer name (e.g. "Upper Deck"), not the full product name -- keep the subset/parallel name in "set" instead.`;
}

function identifyPromptTwoUnordered(allowSearch) {
  const steps = [
    `For each image independently, determine how many degrees it must be rotated CLOCKWISE to appear upright (0, 90, 180, or 270).`,
    `Determine which image (1 or 2) is the front and which is the back.`,
    `Identify the card using both images, mentally correcting for rotation: player name, team, sport, year, card number, the manufacturer/brand (e.g. "Upper Deck", "Topps", "O-Pee-Chee", "Panini", "Score", "Leaf", "Parkhurst" -- whichever company actually printed this card), and the specific set/subset or parallel name separately from the brand (e.g. "Series 1", "Young Guns", "Update", "Chrome", "Black Diamond").`,
    `Any printed year or year-range text on the back (e.g. copyright year, or a range like "89-90") is the single most important detail — read it character by character, very carefully, and treat it as authoritative over any front-only guess. Do not guess a "round" or common-looking year instead of what is actually printed; double-check similar-looking digits (e.g. 8 vs 9, 0 vs 6) before answering.`,
  ];
  if (allowSearch) {
    steps.push(
      `Use web search sparingly -- a handful of well-chosen searches is enough; you don't need to exhaustively cross-check every source. Prefer the Trading Card Database (tcdb.com) as your primary source — it's the source this app's own checklists are built from, so matching its exact card number and set name keeps this card consistent with the checklist. Fall back to PSA, COMC, or eBay sold listings only if TCDB doesn't turn up the answer.`,
      `From your search, try to find a direct image URL for the front of this exact card, and separately for the back, from a page you actually found (a TCDB card-detail page is ideal). Only include a URL if it appeared in your search results — never invent or guess one. If you cannot confidently find one, use null.`,
      `If your search surfaced recent sale prices or listings for this exact card in typical condition, estimate a rough current market value in USD as a plain number (no currency symbol, no commas). If you have no reasonable basis, use null.`
    );
  } else {
    steps.push(
      `No live web search is available for this pass -- work from the two images and your own general trading-card knowledge alone. Leave "frontImageUrl" and "backImageUrl" as null (there's nothing searched to find one from). Give "estimatedValue" a plain USD number only if you're reasonably confident from general knowledge; otherwise use null. If you're not confident about the exact card number or set/subset name, it's fine to answer "confidence":"low" or "medium" rather than guessing -- a second pass with live search will double-check anything uncertain.`
    );
  }
  steps.push(`Rate your overall confidence as "high", "medium", or "low".`);
  const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `You are helping identify a sports trading card. Two images follow, labeled "Image 1" and "Image 2". They show the front and back of the same physical card, but NOT necessarily in that order, and either or both may be sideways or upside down — you must work out both which is which AND their correct orientation.

The front of a card typically shows a photo of the player and their name prominently. The back typically shows stats, text, a logo, or a different layout.

${numbered}

Respond with ONLY a raw JSON object, no markdown fences, no commentary, in exactly this shape:
{${FIELDS_SCHEMA_TWO}}

"frontImageIndex" must be 1 or 2, indicating which of the two provided images is the front. "rotation1" and "rotation2" are the clockwise degrees (0, 90, 180, or 270) needed to make Image 1 and Image 2 upright, respectively. "sport" must be one of: Baseball, Basketball, Football, Hockey, Soccer, Other. "brand" should be just the manufacturer name (e.g. "Upper Deck"), not the full product name -- keep the subset/parallel name in "set" instead.`;
}

function needsSearch(parsed) {
  return (
    !parsed ||
    parsed.confidence === "low" ||
    !parsed.confidence ||
    !String(parsed.cardNumber || "").trim() ||
    !String(parsed.set || "").trim() ||
    !String(parsed.player || "").trim()
  );
}

// --- phone-vs-scan detection, ported from card_ledger.jsx's readJpegExifTags/classifyPhotoOrigin
// (manual JPEG/EXIF byte parsing -- no library needed, same logic, just reading a Buffer instead
// of a browser File's ArrayBuffer). KEEP IN SYNC with card_ledger.jsx if that logic ever changes.
function readJpegExifTags(buf) {
  try {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        offset += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const segLength = view.getUint16(offset + 2, false);
      if (marker === 0xe1) {
        const segStart = offset + 4;
        if (
          segStart + 6 <= view.byteLength &&
          view.getUint32(segStart, false) === 0x45786966 &&
          view.getUint16(segStart + 4, false) === 0x0000
        ) {
          return parseTiffMakeModel(view, segStart + 6);
        }
      }
      offset += 2 + segLength;
    }
  } catch (e) {
    // malformed or unsupported image -- treat as unknown rather than throwing
  }
  return null;
}

function parseTiffMakeModel(view, tiffStart) {
  if (tiffStart + 8 > view.byteLength) return null;
  const little = view.getUint8(tiffStart) === 0x49;
  const g16 = (o) => view.getUint16(o, little);
  const g32 = (o) => view.getUint32(o, little);
  const ifd0Offset = tiffStart + g32(tiffStart + 4);
  if (ifd0Offset + 2 > view.byteLength) return null;
  const numEntries = g16(ifd0Offset);
  const tags = {};
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = g16(entryOffset);
    if (tag !== 0x010f && tag !== 0x0110 && tag !== 0x0131) continue;
    const count = g32(entryOffset + 4);
    const strOffset = count <= 4 ? entryOffset + 8 : tiffStart + g32(entryOffset + 8);
    let str = "";
    for (let j = 0; j < count - 1 && strOffset + j < view.byteLength; j++) {
      const code = view.getUint8(strOffset + j);
      if (code === 0) break;
      str += String.fromCharCode(code);
    }
    str = str.trim();
    if (tag === 0x010f) tags.make = str;
    if (tag === 0x0110) tags.model = str;
    if (tag === 0x0131) tags.software = str;
  }
  return tags;
}

function classifyPhotoOrigin(tags) {
  if (!tags) return { isLikelyPhone: false, reason: "no-exif" };
  const make = (tags.make || "").toLowerCase();
  const model = (tags.model || "").toLowerCase();
  const software = (tags.software || "").toLowerCase();
  if (/scan/.test(software)) return { isLikelyPhone: false, reason: "scanner-software" };
  if (/pixel/.test(model) || /google/.test(make)) return { isLikelyPhone: true, reason: "pixel" };
  if (make || model) return { isLikelyPhone: true, reason: "camera-exif" };
  return { isLikelyPhone: false, reason: "no-camera-tags" };
}

async function detectPhotoSourceNode(filePath) {
  try {
    if (!/\.jpe?g$/i.test(filePath)) return { isLikelyPhone: false, reason: "non-jpeg" };
    const buf = await fsp.readFile(filePath);
    return classifyPhotoOrigin(readJpegExifTags(buf));
  } catch (e) {
    return { isLikelyPhone: false, reason: "error" };
  }
}

// --- image resizing/rotation, using sharp instead of the browser's canvas -----------------
// .rotate() with no argument auto-corrects using the file's own EXIF Orientation tag first (a
// phone photo held sideways), which is independent of and stacks correctly with the AI's own
// later content-based rotation call (the physical card itself scanned/photographed crooked) --
// applying both in sequence is intentional, not a double-rotation bug.
async function resizeToDataUrl(filePath, maxDim, quality) {
  const buf = await sharp(filePath)
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: Math.round(quality * 100) })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function rotateDataUrlNode(dataUrl, degrees) {
  const deg = Number(degrees) || 0;
  if (!deg) return dataUrl;
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const buf = Buffer.from(base64, "base64");
  const out = await sharp(buf).rotate(deg).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

// Walks the import root at ANY depth and collects every folder that directly contains image
// files (a "group"), along with that folder's relative path (for traceability in the review
// queue) and its naturally-sorted file list. Handles both a folder Kaleb has already organized
// one-subfolder-per-card AND a folder full of sequential scans grouped only by team/box/whatever
// -- see groupToItems below for how each shape gets turned into paired front/back items. A
// folder that has BOTH loose images directly in it AND subfolders gets both: its own images as
// one group, plus whatever its subfolders contain, so nothing on disk is silently skipped.
async function findImageGroups(dirAbs, relPath) {
  const entries = await fsp.readdir(dirAbs, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort(naturalSort);
  const images = entries.filter((e) => e.isFile() && IMAGE_EXT.test(e.name)).map((e) => e.name).sort(naturalSort);
  let groups = images.length ? [{ relPath, dirAbs, images }] : [];
  for (const name of subdirs) {
    groups = groups.concat(await findImageGroups(path.join(dirAbs, name), relPath ? `${relPath}/${name}` : name));
  }
  return groups;
}

// A group with 1-2 images IS a card (Kaleb organized it that way himself -- most reliable case,
// immune to a stray photo ever shifting a pairing). A group with MORE than 2 images is treated
// as a flat folder of sequential front/back scans (e.g. "every card from the Stars box, scanned
// in order") and split into one synthetic card per naturally-sorted pair, numbered in scan order
// -- exactly the same front-back-front-back convention the interactive Bulk Add tab has always
// used, just applied per-folder instead of to one flat selection. A single leftover image at the
// end of an odd-numbered folder becomes a front-only card, same as everywhere else in this app.
function groupToItems(group) {
  const { relPath, dirAbs, images } = group;
  if (images.length <= 2) {
    return [{ folderName: relPath || "(root)", frontPath: path.join(dirAbs, images[0]), backPath: images[1] ? path.join(dirAbs, images[1]) : null }];
  }
  const items = [];
  for (let i = 0; i < images.length; i += 2) {
    const n = String(items.length + 1).padStart(4, "0");
    items.push({
      folderName: `${relPath ? relPath + "/" : ""}#${n}`,
      frontPath: path.join(dirAbs, images[i]),
      backPath: images[i + 1] ? path.join(dirAbs, images[i + 1]) : null,
    });
  }
  return items;
}

async function scanImportFolder(rootAbs) {
  const groups = await findImageGroups(rootAbs, "");
  let items = [];
  for (const g of groups) items = items.concat(groupToItems(g));
  return items;
}

// ---------------------------------------------------------------------------------------------
// Anthropic Batch API helpers
// ---------------------------------------------------------------------------------------------
async function anthropicFetch(pathSuffix, opts, apiKey, anthropicVersion) {
  return fetch(`https://api.anthropic.com${pathSuffix}`, {
    ...opts,
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": anthropicVersion, ...((opts && opts.headers) || {}) },
  });
}

async function createBatch(requests, apiKey, anthropicVersion) {
  const res = await anthropicFetch("/v1/messages/batches", { method: "POST", body: JSON.stringify({ requests }) }, apiKey, anthropicVersion);
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || `batch create failed (HTTP ${res.status})`);
  return data;
}

async function getBatch(batchId, apiKey, anthropicVersion) {
  const res = await anthropicFetch(`/v1/messages/batches/${batchId}`, { method: "GET" }, apiKey, anthropicVersion);
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || `batch status failed (HTTP ${res.status})`);
  return data;
}

async function getBatchResults(batchId, apiKey, anthropicVersion) {
  const res = await anthropicFetch(`/v1/messages/batches/${batchId}/results`, { method: "GET" }, apiKey, anthropicVersion);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data.error && data.error.message) || `batch results failed (HTTP ${res.status})`);
  }
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// Anthropic caps a single batch at 100,000 requests OR 256MB of request payload, whichever
// comes first -- and card photos are big enough (thousands of cards x 2 images each) that the
// byte cap, not the count cap, is what actually matters here. Kept well under both caps so a
// job with a couple thousand cards splits into a handful of sub-batches automatically instead
// of ever risking a rejected oversized batch.
const MAX_BATCH_BYTES = 150 * 1024 * 1024;
const MAX_BATCH_REQUESTS = 5000;

function chunkRequests(requests) {
  const chunks = [];
  let current = [];
  let currentBytes = 0;
  for (const req of requests) {
    const size = Buffer.byteLength(JSON.stringify(req));
    if (current.length > 0 && (currentBytes + size > MAX_BATCH_BYTES || current.length >= MAX_BATCH_REQUESTS)) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(req);
    currentBytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function buildIdentifyRequest(item, allowSearch) {
  const urls = item.back_api ? [item.front_api, item.back_api] : [item.front_api];
  const toBase64 = (d) => d.slice(d.indexOf(",") + 1);
  const content = urls.map((d) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: toBase64(d) } }));
  content.push({ type: "text", text: urls.length === 2 ? identifyPromptTwoUnordered(allowSearch) : identifyPromptOne(allowSearch) });
  const params = { model: MODEL_ID, max_tokens: 3000, messages: [{ role: "user", content }] };
  if (allowSearch) {
    params.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  } else {
    // KEEP IN SYNC with card_ledger.jsx's callIdentifyOnce: claude-sonnet-5 runs adaptive
    // thinking by default when "thinking" is omitted, which this cheap no-search pass doesn't
    // need (single-photo extraction, not multi-step reasoning) -- turn it off explicitly.
    params.thinking = { type: "disabled" };
  }
  return { custom_id: item.id, params };
}

function parseResultLine(resultLine) {
  const result = resultLine.result || {};
  if (result.type !== "succeeded") {
    const errMsg = (result.error && result.error.message) || result.type || "unknown batch result";
    return { ok: false, error: errMsg, costUsd: 0 };
  }
  const message = result.message || {};
  const usage = message.usage || {};
  const rates = PRICING[MODEL_ID];
  const searches = (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
  const tokenCost = (usage.input_tokens || 0) * rates.input + (usage.output_tokens || 0) * rates.output;
  const costUsd = (tokenCost + searches * WEB_SEARCH_COST_USD) * BATCH_DISCOUNT;
  const text = (message.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const jsonStart = clean.indexOf("{");
  const jsonEnd = clean.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) return { ok: false, error: "no JSON in response", costUsd };
  try {
    return { ok: true, parsed: JSON.parse(clean.slice(jsonStart, jsonEnd + 1)), costUsd };
  } catch (e) {
    return { ok: false, error: "malformed JSON in response", costUsd };
  }
}

function buildCardEntry(item, parsed, rotatedFront, rotatedBack) {
  const cleanValueMatch =
    parsed.estimatedValue !== null && parsed.estimatedValue !== undefined ? String(parsed.estimatedValue).match(/[\d.]+/) : null;
  const frontIsPhone = !!item.front_is_phone;
  const backIsPhone = !!item.back_is_phone;
  return {
    id: crypto.randomUUID(),
    dateAdded: Date.now(),
    player: parsed.player || "",
    team: parsed.team || "",
    sport: SPORTS.includes(parsed.sport) ? parsed.sport : "Other",
    year: parsed.year ? String(parsed.year) : "",
    brand: parsed.brand || "",
    set: parsed.set || "",
    cardNumber: parsed.cardNumber || "",
    value: cleanValueMatch ? Number(cleanValueMatch[0]) : null,
    onlineFrontUrl: parsed.frontImageUrl || null,
    onlineBackUrl: parsed.backImageUrl || null,
    personalFront: frontIsPhone ? null : rotatedFront,
    personalBack: backIsPhone ? null : rotatedBack || null,
    purchasePhotoFront: frontIsPhone ? rotatedFront : null,
    purchasePhotoBack: backIsPhone ? rotatedBack : null,
    thumbnailSource: (frontIsPhone || backIsPhone) && parsed.frontImageUrl ? "online" : "personal",
    bulkAutoImport: true,
  };
}

// Applies the AI's returned rotation(s) to the full-resolution storage images, exactly mirroring
// identifyOneItem's rotation + front/back-swap logic in card_ledger.jsx.
async function rotateForStorage(item, parsed) {
  const hasBack = !!item.back_storage;
  if (hasBack) {
    const r1 = await rotateDataUrlNode(item.front_storage, parsed.rotation1);
    const r2 = await rotateDataUrlNode(item.back_storage, parsed.rotation2);
    if (Number(parsed.frontImageIndex) === 2) {
      return { front: r2, back: r1, frontIsPhoneOverride: item.back_is_phone, backIsPhoneOverride: item.front_is_phone };
    }
    return { front: r1, back: r2, frontIsPhoneOverride: item.front_is_phone, backIsPhoneOverride: item.back_is_phone };
  }
  const r1 = await rotateDataUrlNode(item.front_storage, parsed.rotation);
  return { front: r1, back: null, frontIsPhoneOverride: item.front_is_phone, backIsPhoneOverride: false };
}

module.exports = function registerBulkImport(app, db, opts) {
  const { importRoot, getApiKey, anthropicVersion } = opts;

  db.exec(`
    CREATE TABLE IF NOT EXISTS bulk_jobs (
      id TEXT PRIMARY KEY,
      folder_name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      total_items INTEGER NOT NULL DEFAULT 0,
      auto_added INTEGER NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      error_message TEXT
    );
    CREATE TABLE IF NOT EXISTS bulk_job_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      folder_name TEXT,
      front_api TEXT,
      back_api TEXT,
      front_storage TEXT,
      back_storage TEXT,
      front_is_phone INTEGER NOT NULL DEFAULT 0,
      back_is_phone INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      batch_id TEXT,
      cost_usd REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bulk_review_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      folder_name TEXT,
      front_storage TEXT,
      back_storage TEXT,
      guess_json TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
  `);

  const insertJob = db.prepare(
    `INSERT INTO bulk_jobs (id, folder_name, status, created_at, updated_at, total_items) VALUES (?,?,?,?,?,?)`
  );
  const insertItem = db.prepare(
    `INSERT INTO bulk_job_items (id, job_id, folder_name, front_api, back_api, front_storage, back_storage, front_is_phone, back_is_phone, status)
     VALUES (?,?,?,?,?,?,?,?,?, 'pending')`
  );
  const updateJobStatus = db.prepare(`UPDATE bulk_jobs SET status=?, updated_at=? WHERE id=?`);
  // Clears any stale error_message left over from an earlier failed tick -- a job that later
  // ticks its way to "done" successfully shouldn't keep showing a "fetch failed" banner forever
  // just because updateJobStatus never used to touch that column.
  const markJobDone = db.prepare(`UPDATE bulk_jobs SET status='done', error_message=NULL, updated_at=? WHERE id=?`);
  const bumpJobCounts = db.prepare(
    `UPDATE bulk_jobs SET auto_added = auto_added + ?, needs_review = needs_review + ?, cost_usd = cost_usd + ?, updated_at=? WHERE id=?`
  );
  // Used by the browser-upload ingest route below: total_items grows chunk-by-chunk as photos
  // arrive from the browser, rather than being known all at once the way a server-folder scan
  // knows its total up front.
  const bumpJobTotal = db.prepare(`UPDATE bulk_jobs SET total_items = total_items + ?, updated_at=? WHERE id=?`);
  const setJobError = db.prepare(`UPDATE bulk_jobs SET status='error', error_message=?, updated_at=? WHERE id=?`);
  const getJob = db.prepare(`SELECT * FROM bulk_jobs WHERE id=?`);
  const listJobs = db.prepare(`SELECT id, folder_name, status, created_at, updated_at, total_items, auto_added, needs_review, cost_usd, error_message FROM bulk_jobs ORDER BY created_at DESC LIMIT 20`);
  const itemsByStatus = db.prepare(`SELECT * FROM bulk_job_items WHERE job_id=? AND status=?`);
  const setItemBatch = db.prepare(`UPDATE bulk_job_items SET status=?, batch_id=? WHERE id=?`);
  const setItemStatus = db.prepare(`UPDATE bulk_job_items SET status=? WHERE id=?`);
  const addItemCost = db.prepare(`UPDATE bulk_job_items SET cost_usd = cost_usd + ? WHERE id=?`);
  const insertReview = db.prepare(
    `INSERT INTO bulk_review_items (id, job_id, folder_name, front_storage, back_storage, guess_json, reason, status, created_at) VALUES (?,?,?,?,?,?,?, 'pending', ?)`
  );
  const listReview = db.prepare(`SELECT * FROM bulk_review_items WHERE status='pending' ORDER BY created_at ASC`);
  const getReview = db.prepare(`SELECT * FROM bulk_review_items WHERE id=?`);
  const setReviewStatus = db.prepare(`UPDATE bulk_review_items SET status=? WHERE id=?`);
  const getStorageStmt = db.prepare("SELECT value FROM kv WHERE key = ?");
  const setStorageStmt = db.prepare(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  function appendCardsToLedger(entries) {
    if (!entries.length) return;
    // Read-modify-write against the same "card-ledger-entries" key the interactive app itself
    // uses. better-sqlite3 is synchronous, so there's no await between this read and write --
    // safe against races from *this* process, though a save from the browser landing in the
    // exact same instant is still theoretically possible. Worth not actively editing the
    // collection in the app while a big import job is running.
    const row = getStorageStmt.get("card-ledger-entries");
    const current = row && row.value ? JSON.parse(row.value) : [];
    const next = current.concat(entries);
    setStorageStmt.run("card-ledger-entries", JSON.stringify(next));
  }

  function safeImportPath(folderName) {
    const rel = String(folderName || "").replace(/^[/\\]+/, "");
    const abs = path.resolve(importRoot, rel);
    if (abs !== importRoot && !abs.startsWith(importRoot + path.sep)) {
      throw new Error("invalid folder path");
    }
    return abs;
  }

  // --- start a new job -----------------------------------------------------------------------
  app.post("/api/bulk-import/start", async (req, res) => {
    try {
      if (!getApiKey()) return res.status(400).json({ error: { message: "No Anthropic API key configured on this server yet." } });
      const folderName = (req.body && req.body.folder) || "";
      const abs = safeImportPath(folderName);
      const stat = await fsp.stat(abs).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        return res.status(400).json({ error: { message: `"${folderName || "."}" isn't a folder under the configured import directory.` } });
      }
      const scanned = await scanImportFolder(abs);
      if (scanned.length === 0) {
        return res.status(400).json({ error: { message: "No subfolders with at least one image were found in that folder." } });
      }
      const jobId = crypto.randomUUID();
      const now = new Date().toISOString();
      insertJob.run(jobId, folderName || ".", "processing", now, now, scanned.length);

      // Image prep happens up front, synchronously relative to the HTTP request, so this call
      // can take a while for thousands of cards -- that's fine, the frontend doesn't need to
      // wait for it (it polls job status separately), but we still respond only once every
      // item's images are safely in the database, so nothing is lost if the request itself
      // fails partway through instead of silently leaving the job half-seeded.
      for (const it of scanned) {
        const [frontApi, frontStorage, frontPhone] = await Promise.all([
          resizeToDataUrl(it.frontPath, 1024, 0.85),
          resizeToDataUrl(it.frontPath, 1280, 0.85),
          detectPhotoSourceNode(it.frontPath),
        ]);
        let backApi = null, backStorage = null, backPhone = { isLikelyPhone: false };
        if (it.backPath) {
          [backApi, backStorage, backPhone] = await Promise.all([
            resizeToDataUrl(it.backPath, 1024, 0.85),
            resizeToDataUrl(it.backPath, 1280, 0.85),
            detectPhotoSourceNode(it.backPath),
          ]);
        }
        insertItem.run(
          crypto.randomUUID(),
          jobId,
          it.folderName,
          frontApi,
          backApi,
          frontStorage,
          backStorage,
          frontPhone.isLikelyPhone ? 1 : 0,
          backPhone.isLikelyPhone ? 1 : 0
        );
      }
      res.json({ jobId, totalItems: scanned.length });
    } catch (err) {
      res.status(500).json({ error: { message: String((err && err.message) || err) } });
    }
  });

  // --- ingest photos uploaded straight from the browser (no server-side folder needed) --------
  // Mirrors /start's end result (rows in bulk_job_items, picked up by the same tickJob loop) but
  // skips the filesystem entirely: the browser already did its own folder-grouping and image
  // resizing (see AutoImportPanel's uploadFolder/buildGroupsFromFiles in card_ledger.jsx, which
  // deliberately mirrors findImageGroups/groupToItems above so both paths group cards the same
  // way) and just hands over already-sized data URLs a few cards at a time. The first chunk of a
  // new upload omits jobId and gets one minted; every later chunk from that same folder passes
  // the jobId back so they all land in one job instead of creating one per chunk.
  app.post("/api/bulk-import/ingest", (req, res) => {
    try {
      if (!getApiKey()) return res.status(400).json({ error: { message: "No Anthropic API key configured on this server yet." } });
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return res.status(400).json({ error: { message: "No cards in this batch." } });
      const now = new Date().toISOString();
      let jobId = body.jobId || null;
      if (jobId) {
        if (!getJob.get(jobId)) return res.status(404).json({ error: { message: "That upload's job is gone -- start the upload over." } });
      } else {
        jobId = crypto.randomUUID();
        const folderLabel = String(body.folderLabel || "uploaded folder").slice(0, 200);
        insertJob.run(jobId, folderLabel, "processing", now, now, 0);
      }
      let inserted = 0;
      for (const it of items) {
        if (!it || typeof it.frontApi !== "string" || typeof it.frontStorage !== "string") continue;
        insertItem.run(
          crypto.randomUUID(),
          jobId,
          String(it.folderName || "").slice(0, 300),
          it.frontApi,
          typeof it.backApi === "string" ? it.backApi : null,
          it.frontStorage,
          typeof it.backStorage === "string" ? it.backStorage : null,
          it.frontIsPhone ? 1 : 0,
          it.backIsPhone ? 1 : 0
        );
        inserted++;
      }
      if (inserted) bumpJobTotal.run(inserted, now, jobId);
      res.json({ jobId, inserted });
    } catch (err) {
      res.status(500).json({ error: { message: String((err && err.message) || err) } });
    }
  });

  app.get("/api/bulk-import/jobs", (req, res) => {
    res.json({ jobs: listJobs.all() });
  });

  app.get("/api/bulk-import/jobs/:id", (req, res) => {
    const job = getJob.get(req.params.id);
    if (!job) return res.status(404).json({ error: { message: "job not found" } });
    res.json({ job });
  });

  app.get("/api/bulk-import/review", (req, res) => {
    res.json({ items: listReview.all().map((r) => ({ ...r, guess: r.guess_json ? JSON.parse(r.guess_json) : null })) });
  });

  // Save a reviewed item (Kaleb has edited/confirmed the fields client-side) straight into the
  // ledger, then mark the review row resolved.
  app.post("/api/bulk-import/review/:id/save", (req, res) => {
    const row = getReview.get(req.params.id);
    if (!row) return res.status(404).json({ error: { message: "review item not found" } });
    const form = req.body || {};
    const entry = {
      id: crypto.randomUUID(),
      dateAdded: Date.now(),
      player: String(form.player || "").trim(),
      team: String(form.team || "").trim(),
      sport: SPORTS.includes(form.sport) ? form.sport : "Other",
      year: String(form.year || "").trim(),
      brand: String(form.brand || "").trim(),
      set: String(form.set || "").trim(),
      cardNumber: String(form.cardNumber || "").trim(),
      value: form.value === "" || form.value === null || form.value === undefined || isNaN(Number(form.value)) ? null : Number(form.value),
      onlineFrontUrl: form.onlineFrontUrl || null,
      onlineBackUrl: form.onlineBackUrl || null,
      personalFront: row.front_storage || null,
      personalBack: row.back_storage || null,
      purchasePhotoFront: null,
      purchasePhotoBack: null,
      thumbnailSource: "personal",
      bulkAutoImport: true,
    };
    if (!entry.player) return res.status(400).json({ error: { message: "Player name is required." } });
    appendCardsToLedger([entry]);
    setReviewStatus.run("resolved", row.id);
    res.json({ ok: true });
  });

  app.post("/api/bulk-import/review/:id/discard", (req, res) => {
    const row = getReview.get(req.params.id);
    if (!row) return res.status(404).json({ error: { message: "review item not found" } });
    setReviewStatus.run("discarded", row.id);
    res.json({ ok: true });
  });

  // --- background progression: submits pending batches, polls in-flight ones, and finalizes
  // results into either the ledger (confident) or the review queue (not confident / failed). ---
  async function submitPass(jobId, items, allowSearch, nextSubmittedStatus) {
    const apiKey = getApiKey();
    const requests = items.map((it) => buildIdentifyRequest(it, allowSearch));
    const chunks = chunkRequests(requests);
    let idx = 0;
    for (const chunk of chunks) {
      const batch = await createBatch(chunk, apiKey, anthropicVersion);
      const chunkIds = new Set(chunk.map((r) => r.custom_id));
      for (const it of items) {
        if (chunkIds.has(it.id)) setItemBatch.run(nextSubmittedStatus, batch.id, it.id);
      }
      idx++;
    }
  }

  async function finalizeSucceeded(jobId, item, parsed, costUsd) {
    addItemCost.run(costUsd, item.id);
    if (needsSearch(parsed) && item.status === "pass1_submitted") {
      // First pass wasn't confident enough -- queue for the search-enabled second pass rather
      // than saving or giving up.
      setItemStatus.run("pending_pass2", item.id);
      return { toReview: false, saved: false };
    }
    // Either pass 1 was already confident, or this IS the pass-2 (search-enabled) result --
    // accept anything better than "low" at this point; a card search still couldn't pin down
    // gets a human look rather than a guess landing permanently in the collection.
    if (parsed.confidence === "low" || !parsed.confidence) {
      const rotated = await rotateForStorage(item, parsed).catch(() => null);
      insertReview.run(
        crypto.randomUUID(),
        jobId,
        item.folder_name,
        (rotated && rotated.front) || item.front_storage,
        (rotated && rotated.back) || item.back_storage,
        JSON.stringify(parsed),
        "low_confidence_after_search",
        new Date().toISOString()
      );
      setItemStatus.run("review", item.id);
      return { toReview: true, saved: false };
    }
    const rotated = await rotateForStorage(item, parsed);
    const entry = buildCardEntry(
      { ...item, front_is_phone: rotated.frontIsPhoneOverride, back_is_phone: rotated.backIsPhoneOverride },
      parsed,
      rotated.front,
      rotated.back
    );
    appendCardsToLedger([entry]);
    setItemStatus.run("saved", item.id);
    return { toReview: false, saved: true };
  }

  async function finalizeFailed(jobId, item, errMsg, costUsd) {
    addItemCost.run(costUsd, item.id);
    if (item.status === "pass1_submitted") {
      // A plain API/parse failure on the cheap pass gets one more shot with search enabled
      // before giving up on it -- same spirit as the interactive app's retry logic.
      setItemStatus.run("pending_pass2", item.id);
      return { toReview: false, saved: false };
    }
    insertReview.run(
      crypto.randomUUID(),
      jobId,
      item.folder_name,
      item.front_storage,
      item.back_storage,
      JSON.stringify({ error: errMsg }),
      "api_error",
      new Date().toISOString()
    );
    setItemStatus.run("review", item.id);
    return { toReview: true, saved: false };
  }

  async function tickJob(job) {
    const apiKey = getApiKey();
    if (!apiKey) return;
    try {
      const pending = itemsByStatus.all(job.id, "pending");
      if (pending.length) await submitPass(job.id, pending, false, "pass1_submitted");

      const pendingPass2 = itemsByStatus.all(job.id, "pending_pass2");
      if (pendingPass2.length) await submitPass(job.id, pendingPass2, true, "pass2_submitted");

      for (const statusName of ["pass1_submitted", "pass2_submitted"]) {
        const submitted = itemsByStatus.all(job.id, statusName);
        const byBatch = new Map();
        for (const it of submitted) {
          if (!it.batch_id) continue;
          if (!byBatch.has(it.batch_id)) byBatch.set(it.batch_id, []);
          byBatch.get(it.batch_id).push(it);
        }
        for (const [batchId, batchItems] of byBatch) {
          const batch = await getBatch(batchId, apiKey, anthropicVersion);
          if (batch.processing_status !== "ended") continue;
          const results = await getBatchResults(batchId, apiKey, anthropicVersion);
          const byCustomId = new Map(results.map((r) => [r.custom_id, r]));
          let addedThisRound = 0;
          let reviewThisRound = 0;
          let costThisRound = 0;
          for (const it of batchItems) {
            const line = byCustomId.get(it.id);
            if (!line) {
              const outcome = await finalizeFailed(job.id, it, "no result returned for this item", 0);
              if (outcome.toReview) reviewThisRound++;
              continue;
            }
            const parsedResult = parseResultLine(line);
            costThisRound += parsedResult.costUsd || 0;
            if (parsedResult.ok) {
              const outcome = await finalizeSucceeded(job.id, it, parsedResult.parsed, parsedResult.costUsd);
              if (outcome.saved) addedThisRound++;
              if (outcome.toReview) reviewThisRound++;
            } else {
              const outcome = await finalizeFailed(job.id, it, parsedResult.error, parsedResult.costUsd);
              if (outcome.toReview) reviewThisRound++;
            }
          }
          bumpJobCounts.run(addedThisRound, reviewThisRound, costThisRound, new Date().toISOString(), job.id);
        }
      }

      const remaining =
        itemsByStatus.all(job.id, "pending").length +
        itemsByStatus.all(job.id, "pass1_submitted").length +
        itemsByStatus.all(job.id, "pending_pass2").length +
        itemsByStatus.all(job.id, "pass2_submitted").length;
      if (remaining === 0) {
        markJobDone.run(new Date().toISOString(), job.id);
      }
    } catch (err) {
      setJobError.run(String((err && err.message) || err), new Date().toISOString(), job.id);
    }
  }

  // Reentrancy guard: without this, a tick that takes longer than the 45s interval below (slow
  // network to Anthropic, a big batch, several active jobs) would still be running when the next
  // interval fires, so a second tickAllJobs() could start processing the SAME job's SAME batch
  // results before the first one had finished marking those items "saved" -- each overlapping
  // pass would independently re-append the same cards to the ledger and re-bump auto_added,
  // which is exactly what produced auto_added counts higher than total_items (and, worse, real
  // duplicate cards in the collection -- see scripts/dedupe-cards.js). One tick running at a time
  // closes that window; it does NOT need to be a database-level lock since only one Node process
  // is ever running this file at a time.
  let tickInFlight = false;
  async function tickAllJobs() {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const active = db.prepare(`SELECT * FROM bulk_jobs WHERE status='processing'`).all();
      for (const job of active) {
        await tickJob(job);
      }
    } finally {
      tickInFlight = false;
    }
  }

  // Checked periodically regardless of whether anyone has the app open -- this is the whole
  // point of running server-side: closing the browser tab (or Kaleb's PC going to sleep) never
  // stalls a job, only the server process itself being down does.
  setInterval(() => {
    tickAllJobs().catch((err) => console.error("bulk-import tick failed:", err));
  }, 45000);
  // Also run once shortly after startup, in case jobs were left mid-flight across a restart.
  setTimeout(() => tickAllJobs().catch((err) => console.error("bulk-import startup tick failed:", err)), 5000);
};
