const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function dateFilterClause(query, params) {
  const clauses = ['deleted_at IS NULL'];
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
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

router.get('/summary', requireAuth, (req, res) => {
  const params = {};
  const where = dateFilterClause(req.query, params);

  const summary = db.prepare(`
    SELECT COUNT(*) AS count, AVG(star_rating) AS avgRating
    FROM reviews ${where}
  `).get(params);

  const distributionRows = db.prepare(`
    SELECT star_rating AS rating, COUNT(*) AS count
    FROM reviews ${where} ${where ? 'AND' : 'WHERE'} star_rating IS NOT NULL
    GROUP BY star_rating
  `).all(params);

  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distributionRows) {
    if (row.rating >= 1 && row.rating <= 5) ratingDistribution[row.rating] = row.count;
  }

  res.json({
    count: summary.count,
    avgRating: summary.avgRating ? Number(summary.avgRating.toFixed(2)) : null,
    ratingDistribution,
  });
});

router.get('/by-tech', requireAuth, (req, res) => {
  const params = {};
  const where = dateFilterClause(req.query, params);

  const rows = db.prepare(`
    SELECT
      tech_name AS techName,
      COUNT(*) AS count,
      AVG(star_rating) AS avgRating
    FROM reviews
    ${where} ${where ? 'AND' : 'WHERE'} tech_name IS NOT NULL AND tech_name != ''
    GROUP BY tech_name
    ORDER BY avgRating DESC
  `).all(params);

  res.json({
    rows: rows.map((r) => ({ ...r, avgRating: r.avgRating ? Number(r.avgRating.toFixed(2)) : null })),
  });
});

router.get('/by-vendor', requireAuth, (req, res) => {
  const params = {};
  const where = dateFilterClause(req.query, params);

  const rows = db.prepare(`
    SELECT
      vendor_id AS vendorId,
      vendor_name AS vendorName,
      COUNT(*) AS count,
      AVG(star_rating) AS avgRating
    FROM reviews
    ${where} ${where ? 'AND' : 'WHERE'} vendor_id IS NOT NULL AND vendor_id != ''
    GROUP BY vendor_id
    ORDER BY avgRating DESC
  `).all(params);

  res.json({
    rows: rows.map((r) => ({ ...r, avgRating: r.avgRating ? Number(r.avgRating.toFixed(2)) : null })),
  });
});

router.get('/attention', requireAuth, (req, res) => {
  const params = {};
  const clauses = ['deleted_at IS NULL', 'star_rating IS NOT NULL', 'star_rating <= @maxRating'];
  params.maxRating = req.query.maxRating ? Number(req.query.maxRating) : 3;

  if (req.query.startDate) {
    clauses.push('review_date >= @startDate');
    params.startDate = req.query.startDate;
  }
  if (req.query.endDate) {
    clauses.push('review_date <= @endDate');
    params.endDate = req.query.endDate;
  }
  if (req.query.tech) {
    clauses.push('tech_name = @tech');
    params.tech = req.query.tech;
  }
  if (req.query.vendorId) {
    clauses.push('vendor_id = @vendorId');
    params.vendorId = req.query.vendorId;
  }

  const limit = Math.min(50, Number(req.query.limit) || 10);

  const rows = db.prepare(`
    SELECT id, customer_first_name, customer_last_name, tech_name, star_rating,
      review_text, review_date, job_id, contact, vendor_id
    FROM reviews
    WHERE ${clauses.join(' AND ')}
    ORDER BY review_date DESC, id DESC
    LIMIT @limit
  `).all({ ...params, limit });

  res.json({ rows });
});

router.get('/monthly', requireAuth, (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const params = { year };
  const extraClauses = [];
  if (req.query.tech) {
    extraClauses.push('tech_name = @tech');
    params.tech = req.query.tech;
  }
  if (req.query.vendorId) {
    extraClauses.push('vendor_id = @vendorId');
    params.vendorId = req.query.vendorId;
  }
  const extraClause = extraClauses.length ? `AND ${extraClauses.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT review_month AS month, COUNT(*) AS count, AVG(star_rating) AS avgRating
    FROM reviews
    WHERE review_year = @year AND deleted_at IS NULL ${extraClause}
    GROUP BY review_month
    ORDER BY review_month
  `).all(params);

  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0, avgRating: null }));
  for (const row of rows) {
    byMonth[row.month - 1] = { month: row.month, count: row.count, avgRating: Number(row.avgRating.toFixed(2)) };
  }

  res.json({ year, rows: byMonth });
});

router.get('/yearly', requireAuth, (req, res) => {
  const params = {};
  const extraClauses = ['deleted_at IS NULL'];
  if (req.query.tech) {
    extraClauses.push('tech_name = @tech');
    params.tech = req.query.tech;
  }
  if (req.query.vendorId) {
    extraClauses.push('vendor_id = @vendorId');
    params.vendorId = req.query.vendorId;
  }
  const where = `WHERE ${extraClauses.join(' AND ')}`;

  const rows = db.prepare(`
    SELECT review_year AS year, COUNT(*) AS count, AVG(star_rating) AS avgRating
    FROM reviews
    ${where}
    GROUP BY review_year
    ORDER BY review_year
  `).all(params);

  res.json({
    rows: rows.map((r) => ({ ...r, avgRating: Number(r.avgRating.toFixed(2)) })),
  });
});

module.exports = router;
