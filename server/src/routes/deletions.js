const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();
const RETENTION_DAYS = 7;

router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT d.id, d.type, d.upload_id, d.description, d.review_count, d.deleted_at, d.reason,
      users.username AS deletedBy
    FROM deletions d
    LEFT JOIN users ON users.id = d.deleted_by
    WHERE d.restored_at IS NULL AND d.purged_at IS NULL
    ORDER BY d.deleted_at DESC
  `).all();

  const withExpiry = rows.map((r) => {
    const deletedAt = new Date(`${r.deleted_at.replace(' ', 'T')}Z`);
    const purgeAt = new Date(deletedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.max(0, Math.ceil((purgeAt - new Date()) / (24 * 60 * 60 * 1000)));
    return { ...r, purgeAt: purgeAt.toISOString(), daysRemaining };
  });

  res.json({ rows: withExpiry });
});

router.post('/:id/restore', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const deletion = db.prepare('SELECT * FROM deletions WHERE id = ? AND restored_at IS NULL AND purged_at IS NULL').get(id);
  if (!deletion) {
    return res.status(404).json({ error: 'Nothing to restore — this may have already been restored or permanently deleted.' });
  }

  const reviewIds = JSON.parse(deletion.review_ids);

  const transaction = db.transaction(() => {
    const restoreReview = db.prepare('UPDATE reviews SET deleted_at = NULL WHERE id = ?');
    for (const reviewId of reviewIds) restoreReview.run(reviewId);
    if (deletion.type === 'upload' && deletion.upload_id) {
      db.prepare('UPDATE uploads SET deleted_at = NULL WHERE id = ?').run(deletion.upload_id);
    }
    db.prepare("UPDATE deletions SET restored_at = datetime('now') WHERE id = ?").run(id);
  });

  try {
    transaction();
  } catch (err) {
    if (/UNIQUE/.test(err.message)) {
      return res.status(409).json({
        error: 'Could not restore — one of these reviews\' Job IDs is now used by a newer review.',
      });
    }
    throw err;
  }

  res.json({ ok: true, restoredCount: reviewIds.length });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const deletion = db.prepare('SELECT * FROM deletions WHERE id = ? AND restored_at IS NULL AND purged_at IS NULL').get(id);
  if (!deletion) {
    return res.status(404).json({ error: 'Nothing to delete — this may have already been restored or permanently deleted.' });
  }

  const reviewIds = JSON.parse(deletion.review_ids);

  const transaction = db.transaction(() => {
    const purgeReview = db.prepare('DELETE FROM reviews WHERE id = ?');
    for (const reviewId of reviewIds) purgeReview.run(reviewId);
    if (deletion.type === 'upload' && deletion.upload_id) {
      db.prepare('DELETE FROM uploads WHERE id = ?').run(deletion.upload_id);
    }
    db.prepare("UPDATE deletions SET purged_at = datetime('now') WHERE id = ?").run(id);
  });
  transaction();

  res.json({ ok: true, purgedCount: reviewIds.length });
});

module.exports = router;
