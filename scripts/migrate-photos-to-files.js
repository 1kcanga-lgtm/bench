// One-off migration: moves card photo fields (personalFront/personalBack/purchasePhotoFront/
// purchasePhotoBack) from embedded base64 data URLs to raw JPEG files on disk (data/photos/),
// referenced by URL instead -- see CLAUDE.md / conversation history for why: every save
// previously re-uploaded the ENTIRE collection's embedded photos, and Gallery load blocked on
// parsing the whole blob, both getting worse as the collection grows.
//
// Also backfills the orphaned duplicate base64 that's been accumulating in bulk_job_items and
// bulk_review_items (their bytes get copied elsewhere -- the main ledger, or a review row -- but
// were never cleared from the original row). Only rows in a TERMINAL status get cleared here
// (bulk_job_items: 'saved'/'review'; bulk_review_items: 'resolved'/'discarded') -- anything still
// in flight keeps its bytes, since the tick loop or the review UI still needs them.
//
// Idempotent and safe to re-run: already-migrated fields (already a URL, not a data: URL) are
// skipped, and already-cleared bulk-table rows are simply no-ops on the second pass.
//
// Usage (run inside the bench container, where better-sqlite3 + the DB are already present):
//   node scripts/migrate-photos-to-files.js         -- dry run: reports what it would do, changes nothing
//   node scripts/migrate-photos-to-files.js --apply  -- snapshots the DB, then writes files + rewrites rows
"use strict";

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { createPhotoStore } = require("../photo-store");

const DB_PATH = process.env.DB_PATH || "/app/data/card-ledger.db";
const APPLY = process.argv.includes("--apply");
const DATA_DIR = path.dirname(DB_PATH);
const PHOTOS_DIR = path.join(DATA_DIR, "photos");

const PHOTO_FIELDS = ["personalFront", "personalBack", "purchasePhotoFront", "purchasePhotoBack"];

function isDataUrl(v) {
  return typeof v === "string" && v.startsWith("data:image/");
}
function isAlreadyUrl(v) {
  return typeof v === "string" && (v.startsWith("/photos/") || v.startsWith("http://") || v.startsWith("https://"));
}

async function migrateLedgerPhotos(db, savePhotoFile) {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get("card-ledger-entries");
  if (!row || !row.value) {
    console.log("No card-ledger-entries found -- nothing to migrate there.");
    return { filesWritten: 0 };
  }

  const cards = JSON.parse(row.value);
  console.log(`Loaded ${cards.length} cards from ${DB_PATH}`);

  let candidateCount = 0;
  let candidateBytes = 0;
  let warnCount = 0;
  for (const card of cards) {
    for (const field of PHOTO_FIELDS) {
      const v = card[field];
      if (v === null || v === undefined || v === "" || isAlreadyUrl(v)) continue;
      if (!isDataUrl(v)) {
        console.warn(`  warning: card ${card.id} field "${field}" is neither empty, a URL, nor a data:image/ URL -- skipping`);
        warnCount++;
        continue;
      }
      candidateCount++;
      candidateBytes += v.length;
    }
  }
  console.log(
    `${candidateCount} photo field(s) to convert (~${(candidateBytes / 1024 / 1024).toFixed(1)}MB of base64), ${warnCount} warning(s).`
  );

  if (!APPLY || candidateCount === 0) return { filesWritten: 0 };

  // Back up the raw JSON string before mutating anything, same pattern as dedupe-cards.js.
  const backupPath = path.join(DATA_DIR, `card-ledger-entries-backup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, row.value);
  console.log(`Backed up current entries to ${backupPath}`);

  let filesWritten = 0;
  for (const card of cards) {
    for (const field of PHOTO_FIELDS) {
      const v = card[field];
      if (!isDataUrl(v)) continue;
      card[field] = await savePhotoFile(v, null);
      filesWritten++;
    }
  }

  db.prepare(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run("card-ledger-entries", JSON.stringify(cards));
  console.log(`Wrote ${filesWritten} photo file(s), updated card-ledger-entries.`);

  // Verification: re-read what we just wrote, confirm no embedded base64 remains and every
  // referenced file actually exists on disk.
  const verifyCards = JSON.parse(db.prepare("SELECT value FROM kv WHERE key = ?").get("card-ledger-entries").value);
  let stillEmbedded = 0;
  let missingFiles = 0;
  for (const card of verifyCards) {
    for (const field of PHOTO_FIELDS) {
      const v = card[field];
      if (isDataUrl(v)) stillEmbedded++;
      if (typeof v === "string" && v.startsWith("/photos/")) {
        const id = v.slice("/photos/".length).split("?")[0];
        if (!fs.existsSync(path.join(PHOTOS_DIR, id))) missingFiles++;
      }
    }
  }
  if (stillEmbedded || missingFiles) {
    console.warn(`  VERIFICATION WARNING: ${stillEmbedded} field(s) still embedded, ${missingFiles} referenced file(s) missing on disk.`);
  } else {
    console.log("Verification passed: no embedded base64 remains, every referenced photo file exists.");
  }

  return { filesWritten };
}

function reclaimBulkTableBytes(db) {
  const jobBytes = db
    .prepare(
      `SELECT COALESCE(SUM(LENGTH(front_api)),0) + COALESCE(SUM(LENGTH(back_api)),0) +
              COALESCE(SUM(LENGTH(front_storage)),0) + COALESCE(SUM(LENGTH(back_storage)),0) AS bytes
       FROM bulk_job_items WHERE status IN ('saved','review')`
    )
    .get().bytes;
  const reviewBytes = db
    .prepare(
      `SELECT COALESCE(SUM(LENGTH(front_storage)),0) + COALESCE(SUM(LENGTH(back_storage)),0) AS bytes
       FROM bulk_review_items WHERE status IN ('resolved','discarded')`
    )
    .get().bytes;
  const totalMb = ((jobBytes + reviewBytes) / 1024 / 1024).toFixed(1);
  console.log(`Orphaned base64 in bulk tables (already copied elsewhere, safe to clear): ~${totalMb}MB.`);

  if (!APPLY) return;

  const jobResult = db
    .prepare(
      `UPDATE bulk_job_items SET front_api=NULL, back_api=NULL, front_storage=NULL, back_storage=NULL
       WHERE status IN ('saved','review') AND (front_api IS NOT NULL OR back_api IS NOT NULL OR front_storage IS NOT NULL OR back_storage IS NOT NULL)`
    )
    .run();
  const reviewResult = db
    .prepare(
      `UPDATE bulk_review_items SET front_storage=NULL, back_storage=NULL
       WHERE status IN ('resolved','discarded') AND (front_storage IS NOT NULL OR back_storage IS NOT NULL)`
    )
    .run();
  console.log(`Cleared ${jobResult.changes} bulk_job_items row(s), ${reviewResult.changes} bulk_review_items row(s).`);
}

async function main() {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  const { savePhotoFile } = createPhotoStore(PHOTOS_DIR);

  if (APPLY) {
    const backupDbPath = path.join(DATA_DIR, `card-ledger.db.bak-${Date.now()}`);
    await db.backup(backupDbPath);
    console.log(`DB snapshot written to ${backupDbPath} -- restore this file to roll back.`);
  }

  await migrateLedgerPhotos(db, savePhotoFile);
  reclaimBulkTableBytes(db);

  if (!APPLY) {
    console.log("\nDry run only -- nothing was changed. Re-run with --apply to actually migrate.");
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
