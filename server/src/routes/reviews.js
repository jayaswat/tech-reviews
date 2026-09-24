const express = require('express');
const XLSX = require('xlsx');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

function buildFilters(query) {
  const clauses = ['deleted_at IS NULL'];
  const params = {};

  if (query.startDate) {
    clauses.push('review_date >= @startDate');
    params.startDate = query.startDate;
  }
  if (query.endDate) {
    clauses.push('review_date <= @endDate');
    params.endDate = query.endDate;
  }
  if (query.tech) {
    clauses.push('tech_name = @tech');
    params.tech = query.tech;
  }
  if (query.vendorId) {
    clauses.push('vendor_id = @vendorId');
    params.vendorId = query.vendorId;
  }
  if (query.minRating) {
    clauses.push('star_rating >= @minRating');
    params.minRating = Number(query.minRating);
  }
  if (query.maxRating) {
    clauses.push('star_rating <= @maxRating');
    params.maxRating = Number(query.maxRating);
  }
  if (query.q) {
    clauses.push(`(
      customer_first_name LIKE @q OR
      customer_last_name LIKE @q OR
      job_id LIKE @q OR
      address LIKE @q
    )`);
    params.q = `%${query.q}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

router.get('/', requireAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
  const offset = (page - 1) * pageSize;

  const { where, params } = buildFilters(req.query);

  const total = db.prepare(`SELECT COUNT(*) AS count FROM reviews ${where}`).get(params).count;
  const rows = db.prepare(`
    SELECT * FROM reviews ${where}
    ORDER BY review_date DESC, id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pageSize, offset });

  res.json({ rows, total, page, pageSize });
});

router.get('/export', requireAuth, (req, res) => {
  const { where, params } = buildFilters(req.query);

  const rows = db.prepare(`
    SELECT review_date, customer_first_name, customer_last_name, job_id, star_rating, tech_name,
      vendor_id, vendor_name, address, contact, review_text
    FROM reviews ${where}
    ORDER BY review_date DESC, id DESC
  `).all(params);

  const headers = [
    'Date', 'First Name', 'Last Name', 'Job ID', 'Rating', 'Technician',
    'Vendor ID', 'Vendor Name', 'Address', 'Contact', 'Comments',
  ];
  const aoa = [
    headers,
    ...rows.map((r) => [
      r.review_date, r.customer_first_name, r.customer_last_name, r.job_id, r.star_rating,
      r.tech_name, r.vendor_id, r.vendor_name, r.address, r.contact, r.review_text,
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Reviews');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const filename = `reviews-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

const EDITABLE_FIELDS = [
  'customer_first_name',
  'customer_last_name',
  'job_id',
  'star_rating',
  'tech_name',
  'address',
  'contact',
  'review_text',
  'review_date',
  'vendor_name',
  'vendor_id',
];

router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM reviews WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Review not found' });
  }

  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if ('star_rating' in updates) {
    if (updates.star_rating === '' || updates.star_rating === null) {
      updates.star_rating = null;
    } else {
      const rating = Number(updates.star_rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }
      updates.star_rating = Math.round(rating);
    }
  }

  if ('review_date' in updates) {
    const match = String(updates.review_date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
    }
    updates.review_year = Number(match[1]);
    updates.review_month = Number(match[2]);
  }

  const merged = { ...existing, ...updates, id };

  try {
    db.prepare(`
      UPDATE reviews SET
        customer_first_name = @customer_first_name,
        customer_last_name = @customer_last_name,
        job_id = @job_id,
        star_rating = @star_rating,
        tech_name = @tech_name,
        address = @address,
        contact = @contact,
        review_text = @review_text,
        review_date = @review_date,
        review_year = @review_year,
        review_month = @review_month,
        vendor_name = @vendor_name,
        vendor_id = @vendor_id
      WHERE id = @id
    `).run(merged);
  } catch (err) {
    if (/UNIQUE/.test(err.message)) {
      return res.status(409).json({ error: 'Another review already uses that Job ID.' });
    }
    throw err;
  }

  const updated = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  res.json({ row: updated });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const review = db.prepare('SELECT * FROM reviews WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!review) {
    return res.status(404).json({ error: 'Review not found' });
  }

  const description = `${review.customer_first_name} ${review.customer_last_name}`.trim() || `Review #${review.id}`;

  const transaction = db.transaction(() => {
    db.prepare("UPDATE reviews SET deleted_at = datetime('now') WHERE id = ?").run(id);
    db.prepare(`
      INSERT INTO deletions (type, upload_id, review_ids, description, review_count, deleted_by)
      VALUES ('review', NULL, @review_ids, @description, 1, @deleted_by)
    `).run({
      review_ids: JSON.stringify([id]),
      description,
      deleted_by: req.session.user.id,
    });
  });
  transaction();

  res.json({ ok: true });
});

module.exports = router;
