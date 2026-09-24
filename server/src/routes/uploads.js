const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAdmin } = require('../auth');
const { parseReviewWorkbook } = require('../utils/excelParser');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let parsed;
  try {
    parsed = parseReviewWorkbook(req.file.buffer, new Date());
  } catch (err) {
    return res.status(400).json({ error: 'Could not read this file. Make sure it is a valid .xlsx, .xls, or .csv file.' });
  }

  if (parsed.errors.length > 0) {
    return res.status(400).json({ error: parsed.errors[0] });
  }

  if (parsed.rows.length === 0) {
    return res.status(400).json({ error: 'No usable rows were found in this file.', unmappedHeaders: parsed.unmappedHeaders });
  }

  const insertUpload = db.prepare(
    'INSERT INTO uploads (filename, uploaded_by, row_count, skipped_count, updated_count) VALUES (?, ?, ?, ?, ?)'
  );

  // A review is treated as a duplicate of an existing one when it shares the same job ID (the
  // natural key for a single service call/dispatch). Files without a job ID fall back to matching
  // customer + technician + date + rating, since re-exports commonly overlap date ranges. Rather than
  // silently overwriting the old row, the duplicate is moved to the trash (reason: "Duplicate value")
  // and the new data is inserted fresh — so an admin can see and undo it if the match was wrong.
  const findByJobId = db.prepare(`
    SELECT id, customer_first_name, customer_last_name FROM reviews
    WHERE job_id = @job_id AND deleted_at IS NULL
  `);
  const findByComposite = db.prepare(`
    SELECT id, customer_first_name, customer_last_name FROM reviews
    WHERE (job_id IS NULL OR job_id = '')
      AND deleted_at IS NULL
      AND customer_first_name = @customer_first_name
      AND customer_last_name = @customer_last_name
      AND tech_name = @tech_name
      AND review_date = @review_date
      AND star_rating IS @star_rating
  `);

  const insertReview = db.prepare(`
    INSERT INTO reviews (
      customer_first_name, customer_last_name, job_id, star_rating, tech_name,
      address, contact, review_text, review_date, review_year, review_month,
      vendor_name, vendor_id, extra_data, upload_id
    ) VALUES (@customer_first_name, @customer_last_name, @job_id, @star_rating, @tech_name,
      @address, @contact, @review_text, @review_date, @review_year, @review_month,
      @vendor_name, @vendor_id, @extra_data, @upload_id)
  `);
  const softDeleteReview = db.prepare("UPDATE reviews SET deleted_at = datetime('now') WHERE id = ?");
  const insertDeletion = db.prepare(`
    INSERT INTO deletions (type, upload_id, review_ids, description, review_count, reason, deleted_by)
    VALUES ('review', NULL, @review_ids, @description, @review_count, 'Duplicate value', NULL)
  `);

  const transaction = db.transaction((rows) => {
    const uploadResult = insertUpload.run(req.file.originalname, req.session.user.id, 0, 0, 0);
    const uploadId = uploadResult.lastInsertRowid;

    let insertedCount = 0;
    let updatedCount = 0;
    const replacedIds = [];

    for (const row of rows) {
      const payload = { ...row, upload_id: uploadId };
      const existing = row.job_id ? findByJobId.get(payload) : findByComposite.get(payload);

      if (existing) {
        softDeleteReview.run(existing.id);
        replacedIds.push(existing.id);
        insertReview.run(payload);
        updatedCount++;
      } else {
        insertReview.run(payload);
        insertedCount++;
      }
    }

    // All duplicates replaced by this one upload are grouped into a single trash entry — a file with
    // 90 overlapping rows shouldn't flood Recently Deleted with 90 separate lines.
    if (replacedIds.length > 0) {
      insertDeletion.run({
        review_ids: JSON.stringify(replacedIds),
        description: `${replacedIds.length} duplicate review${replacedIds.length === 1 ? '' : 's'} replaced while uploading "${req.file.originalname}"`,
        review_count: replacedIds.length,
      });
    }

    db.prepare('UPDATE uploads SET row_count = ?, updated_count = ? WHERE id = ?').run(insertedCount, updatedCount, uploadId);

    return { uploadId, insertedCount, updatedCount };
  });

  const { uploadId, insertedCount, updatedCount } = transaction(parsed.rows);

  res.json({
    uploadId,
    insertedCount,
    updatedCount,
    sheetName: parsed.sheetName,
    unmappedHeaders: parsed.unmappedHeaders,
    mappedFields: parsed.mappedFields,
  });
});

router.get('/', requireAdmin, (req, res) => {
  const uploads = db.prepare(`
    SELECT u.id, u.filename, u.uploaded_at, u.row_count, u.updated_count, users.username AS uploaded_by,
      (SELECT COUNT(*) FROM reviews r WHERE r.upload_id = u.id AND r.deleted_at IS NULL) AS activeCount
    FROM uploads u
    LEFT JOIN users ON users.id = u.uploaded_by
    WHERE u.deleted_at IS NULL
    ORDER BY u.uploaded_at DESC
    LIMIT 50
  `).all();
  res.json({ uploads });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const uploadId = Number(req.params.id);
  const uploadRow = db.prepare('SELECT * FROM uploads WHERE id = ? AND deleted_at IS NULL').get(uploadId);
  if (!uploadRow) {
    return res.status(404).json({ error: 'Upload not found' });
  }

  const activeReviews = db.prepare('SELECT id FROM reviews WHERE upload_id = ? AND deleted_at IS NULL').all(uploadId);

  // Every one of this upload's reviews may have already been superseded by a later, overlapping
  // upload (moved to the trash there as a duplicate). There's nothing left here to move to the trash,
  // but the admin should still be able to clear this now-empty entry out of Recent Uploads.
  if (activeReviews.length === 0) {
    db.prepare("UPDATE uploads SET deleted_at = datetime('now') WHERE id = ?").run(uploadId);
    return res.json({ ok: true, deletedCount: 0, alreadyEmpty: true });
  }

  const transaction = db.transaction(() => {
    db.prepare("UPDATE reviews SET deleted_at = datetime('now') WHERE upload_id = ? AND deleted_at IS NULL").run(uploadId);
    db.prepare("UPDATE uploads SET deleted_at = datetime('now') WHERE id = ?").run(uploadId);
    db.prepare(`
      INSERT INTO deletions (type, upload_id, review_ids, description, review_count, deleted_by)
      VALUES ('upload', @upload_id, @review_ids, @description, @review_count, @deleted_by)
    `).run({
      upload_id: uploadId,
      review_ids: JSON.stringify(activeReviews.map((r) => r.id)),
      description: uploadRow.filename,
      review_count: activeReviews.length,
      deleted_by: req.session.user.id,
    });
  });
  transaction();

  res.json({ ok: true, deletedCount: activeReviews.length });
});

module.exports = router;
