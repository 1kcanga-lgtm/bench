// Shared photo-file storage, used by both server.js (the /api/photos upload route) and
// bulk-import.js (writing a file directly at finalize time, no HTTP round-trip needed since it's
// already in-process). Kept in one place so the decode/write/reuse logic isn't duplicated between
// the two callers -- see the CLAUDE.md note on bulk-import.js/card_ledger.jsx duplication for why
// that's worth avoiding here.
"use strict";

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

// Matches a URL previously returned by savePhotoFile, e.g. "/photos/<uuid>.jpg?v=123".
// Photo identity is the uuid alone -- deliberately NOT keyed on card id or field name, since
// photos get uploaded before a card (or even its id) exists, both in the Bulk Add queue and in
// bulk-import's job items. A caller that wants to overwrite-in-place (rotate, replace) passes the
// existing URL back in as `previousUrl`; anything else mints a fresh uuid.
const PHOTO_URL_RE = /^\/photos\/([0-9a-f-]{36})\.jpg(?:\?.*)?$/;

function createPhotoStore(photosDir) {
  async function savePhotoFile(dataUrl, previousUrl) {
    if (!dataUrl) return null;
    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s.exec(dataUrl);
    if (!match) throw new Error("savePhotoFile expected a data:image/... base64 URL");

    const reuseMatch = typeof previousUrl === "string" ? PHOTO_URL_RE.exec(previousUrl) : null;
    const id = reuseMatch ? reuseMatch[1] : crypto.randomUUID();

    const buffer = Buffer.from(match[1], "base64");
    await fs.writeFile(path.join(photosDir, `${id}.jpg`), buffer);

    return `/photos/${id}.jpg?v=${Date.now()}`;
  }

  return { savePhotoFile };
}

module.exports = { createPhotoStore, PHOTO_URL_RE };
