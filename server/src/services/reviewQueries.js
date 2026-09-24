// Read-only data access used by the AI chat tools. Deliberately mirrors the same filtered
// queries the Dashboard/Reviews pages use, so the assistant's numbers always match what a human
// would see on-screen — it never sees or touches anything outside these functions.
const db = require('../db');

function dateFilter(clauses, params, { startDate, endDate, tech, vendorId }) {
  if (startDate) {
    clauses.push('review_date >= @startDate');
    params.startDate = startDate;
  }
  if (endDate) {
    clauses.push('review_date <= @endDate');
    params.endDate = endDate;
  }
  if (tech) {
    clauses.push('tech_name = @tech');
    params.tech = String(tech).toUpperCase();
  }
  if (vendorId) {
    clauses.push('vendor_id = @vendorId');
    params.vendorId = String(vendorId);
  }
}

function searchReviews({ startDate, endDate, tech, vendorId, minRating, maxRating, q, limit } = {}) {
  const clauses = ['deleted_at IS NULL'];
  const params = {};
  dateFilter(clauses, params, { startDate, endDate, tech, vendorId });
  if (minRating) {
    clauses.push('star_rating >= @minRating');
    params.minRating = Number(minRating);
  }
  if (maxRating) {
    clauses.push('star_rating <= @maxRating');
    params.maxRating = Number(maxRating);
  }
  if (q) {
    clauses.push('(customer_first_name LIKE @q OR customer_last_name LIKE @q OR job_id LIKE @q OR review_text LIKE @q)');
    params.q = `%${q}%`;
  }
  const cappedLimit = Math.max(1, Math.min(30, Number(limit) || 15));

  const rows = db.prepare(`
    SELECT review_date, customer_first_name, customer_last_name, job_id, star_rating,
      tech_name, vendor_id, address, contact, review_text
    FROM reviews
    WHERE ${clauses.join(' AND ')}
    ORDER BY review_date DESC, id DESC
    LIMIT @limit
  `).all({ ...params, limit: cappedLimit });

  return { count: rows.length, reviews: rows };
}

function getSummaryStats({ startDate, endDate, tech, vendorId } = {}) {
  const clauses = ['deleted_at IS NULL'];
  const params = {};
  dateFilter(clauses, params, { startDate, endDate, tech, vendorId });
  const where = `WHERE ${clauses.join(' AND ')}`;

  const summary = db.prepare(`SELECT COUNT(*) AS count, AVG(star_rating) AS avgRating FROM reviews ${where}`).get(params);
  const distribution = db.prepare(`
    SELECT star_rating AS rating, COUNT(*) AS count FROM reviews ${where} AND star_rating IS NOT NULL GROUP BY star_rating
  `).all(params);

  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distribution) {
    if (row.rating >= 1 && row.rating <= 5) ratingDistribution[row.rating] = row.count;
  }

  return {
    count: summary.count,
    avgRating: summary.avgRating ? Number(summary.avgRating.toFixed(2)) : null,
    ratingDistribution,
  };
}

function getStatsByTechnician({ startDate, endDate, vendorId } = {}) {
  const clauses = ['deleted_at IS NULL', "tech_name IS NOT NULL", "tech_name != ''"];
  const params = {};
  dateFilter(clauses, params, { startDate, endDate, vendorId });

  const rows = db.prepare(`
    SELECT tech_name AS techName, COUNT(*) AS count, AVG(star_rating) AS avgRating
    FROM reviews WHERE ${clauses.join(' AND ')} GROUP BY tech_name ORDER BY avgRating DESC
  `).all(params);

  return rows.map((r) => ({ ...r, avgRating: r.avgRating ? Number(r.avgRating.toFixed(2)) : null }));
}

function getStatsByVendor({ startDate, endDate, tech } = {}) {
  const clauses = ['deleted_at IS NULL', "vendor_id IS NOT NULL", "vendor_id != ''"];
  const params = {};
  dateFilter(clauses, params, { startDate, endDate, tech });

  const rows = db.prepare(`
    SELECT vendor_id AS vendorId, vendor_name AS vendorName, COUNT(*) AS count, AVG(star_rating) AS avgRating
    FROM reviews WHERE ${clauses.join(' AND ')} GROUP BY vendor_id ORDER BY avgRating DESC
  `).all(params);

  return rows.map((r) => ({ ...r, avgRating: r.avgRating ? Number(r.avgRating.toFixed(2)) : null }));
}

function getMonthlyTrend({ year, tech, vendorId } = {}) {
  const y = Number(year) || new Date().getFullYear();
  const clauses = ['deleted_at IS NULL', 'review_year = @year'];
  const params = { year: y };
  if (tech) {
    clauses.push('tech_name = @tech');
    params.tech = String(tech).toUpperCase();
  }
  if (vendorId) {
    clauses.push('vendor_id = @vendorId');
    params.vendorId = String(vendorId);
  }

  const rows = db.prepare(`
    SELECT review_month AS month, COUNT(*) AS count, AVG(star_rating) AS avgRating
    FROM reviews WHERE ${clauses.join(' AND ')} GROUP BY review_month ORDER BY review_month
  `).all(params);

  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0, avgRating: null }));
  for (const row of rows) byMonth[row.month - 1] = { month: row.month, count: row.count, avgRating: Number(row.avgRating.toFixed(2)) };
  return { year: y, months: byMonth };
}

function getYearlyTrend({ tech, vendorId } = {}) {
  const clauses = ['deleted_at IS NULL'];
  const params = {};
  if (tech) {
    clauses.push('tech_name = @tech');
    params.tech = String(tech).toUpperCase();
  }
  if (vendorId) {
    clauses.push('vendor_id = @vendorId');
    params.vendorId = String(vendorId);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;

  const rows = db.prepare(`
    SELECT review_year AS year, COUNT(*) AS count, AVG(star_rating) AS avgRating
    FROM reviews ${where} GROUP BY review_year ORDER BY review_year
  `).all(params);

  return rows.map((r) => ({ ...r, avgRating: Number(r.avgRating.toFixed(2)) }));
}

function listTechnicians() {
  return db.prepare(`
    SELECT DISTINCT tech_name AS techName FROM reviews WHERE tech_name IS NOT NULL AND tech_name != '' AND deleted_at IS NULL ORDER BY tech_name
  `).all().map((r) => r.techName);
}

function listVendors() {
  return db.prepare(`
    SELECT DISTINCT vendor_id AS vendorId, vendor_name AS vendorName FROM reviews WHERE vendor_id IS NOT NULL AND vendor_id != '' AND deleted_at IS NULL ORDER BY vendor_id
  `).all();
}

module.exports = {
  searchReviews,
  getSummaryStats,
  getStatsByTechnician,
  getStatsByVendor,
  getMonthlyTrend,
  getYearlyTrend,
  listTechnicians,
  listVendors,
};
