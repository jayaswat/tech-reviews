const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'reviews.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    row_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_first_name TEXT,
    customer_last_name TEXT,
    job_id TEXT,
    star_rating INTEGER,
    tech_name TEXT,
    address TEXT,
    contact TEXT,
    review_text TEXT,
    review_date TEXT NOT NULL,
    review_year INTEGER NOT NULL,
    review_month INTEGER NOT NULL,
    vendor_name TEXT,
    vendor_id TEXT,
    extra_data TEXT,
    upload_id INTEGER REFERENCES uploads(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS deletions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('upload', 'review')),
    upload_id INTEGER,
    review_ids TEXT NOT NULL,
    description TEXT NOT NULL,
    review_count INTEGER NOT NULL,
    reason TEXT,
    deleted_by INTEGER REFERENCES users(id),
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    restored_at TEXT,
    purged_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(review_date);
  CREATE INDEX IF NOT EXISTS idx_reviews_year_month ON reviews(review_year, review_month);
  CREATE INDEX IF NOT EXISTS idx_reviews_tech ON reviews(tech_name);
  CREATE INDEX IF NOT EXISTS idx_reviews_vendor ON reviews(vendor_id);
  CREATE INDEX IF NOT EXISTS idx_deletions_active ON deletions(restored_at, purged_at);
`);

// Lightweight migrations for installs created before these columns existed.
const uploadColumns = db.prepare("PRAGMA table_info(uploads)").all().map((c) => c.name);
if (!uploadColumns.includes('updated_count')) {
  db.exec('ALTER TABLE uploads ADD COLUMN updated_count INTEGER NOT NULL DEFAULT 0');
}
if (!uploadColumns.includes('deleted_at')) {
  db.exec('ALTER TABLE uploads ADD COLUMN deleted_at TEXT');
}
const reviewColumns = db.prepare("PRAGMA table_info(reviews)").all().map((c) => c.name);
if (!reviewColumns.includes('deleted_at')) {
  db.exec('ALTER TABLE reviews ADD COLUMN deleted_at TEXT');
}
const deletionColumns = db.prepare("PRAGMA table_info(deletions)").all().map((c) => c.name);
if (!deletionColumns.includes('reason')) {
  db.exec('ALTER TABLE deletions ADD COLUMN reason TEXT');
}

// Self-healing cleanup: normalize technician name casing so a source file's inconsistent
// capitalization (e.g. a row with "cody" alongside others with "CODY") can't fragment one
// technician's reviews into separate filter/analytics entries.
db.exec(`UPDATE reviews SET tech_name = UPPER(tech_name) WHERE tech_name IS NOT NULL AND tech_name != UPPER(tech_name)`);

// Self-healing cleanup: collapse any reviews that already share a job ID (e.g. from a re-uploaded
// file before duplicate detection existed) down to one row, keeping the earliest. This runs on every
// startup but is a no-op once the data is clean, and guarantees the unique index below can always be
// created. Soft-deleted rows are left out of the comparison — a trashed job ID no longer blocks a
// fresh upload of that job.
db.exec(`
  DELETE FROM reviews
  WHERE job_id IS NOT NULL AND job_id != '' AND deleted_at IS NULL
    AND id NOT IN (
      SELECT MIN(id) FROM reviews
      WHERE job_id IS NOT NULL AND job_id != '' AND deleted_at IS NULL
      GROUP BY job_id
    )
`);

// Rebuilt (not just IF NOT EXISTS) on every startup: SQLite's IF NOT EXISTS only checks the index's
// name, not its definition, so a stale index from before a WHERE-clause change (e.g. adding the
// deleted_at condition below) would otherwise linger forever under the same name.
const currentIndexSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_reviews_job_id_unique'").get();
const desiredIndexSql =
  "CREATE UNIQUE INDEX idx_reviews_job_id_unique ON reviews(job_id) WHERE job_id IS NOT NULL AND job_id != '' AND deleted_at IS NULL";
if (!currentIndexSql || currentIndexSql.sql.replace(/\s+/g, ' ').trim() !== desiredIndexSql) {
  db.exec('DROP INDEX IF EXISTS idx_reviews_job_id_unique');
  db.exec(desiredIndexSql);
}

// Auto-purge: anything sitting in the trash for more than 7 days is permanently removed. Runs on
// every startup so recovery windows are honored even if the server wasn't running exactly at the
// 7-day mark.
const RETENTION_DAYS = 7;
const expiredDeletions = db.prepare(`
  SELECT * FROM deletions
  WHERE restored_at IS NULL AND purged_at IS NULL
    AND deleted_at <= datetime('now', '-${RETENTION_DAYS} days')
`).all();

if (expiredDeletions.length > 0) {
  const purgeReviews = db.prepare('DELETE FROM reviews WHERE id = ?');
  const purgeUpload = db.prepare('DELETE FROM uploads WHERE id = ?');
  const markPurged = db.prepare('UPDATE deletions SET purged_at = datetime(\'now\') WHERE id = ?');

  const purgeAll = db.transaction((events) => {
    for (const event of events) {
      const ids = JSON.parse(event.review_ids);
      for (const id of ids) purgeReviews.run(id);
      if (event.type === 'upload' && event.upload_id) purgeUpload.run(event.upload_id);
      markPurged.run(event.id);
    }
  });
  purgeAll(expiredDeletions);
}

module.exports = db;
