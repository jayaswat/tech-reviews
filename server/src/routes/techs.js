const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT tech_name AS techName FROM reviews
    WHERE tech_name IS NOT NULL AND tech_name != '' AND deleted_at IS NULL
    ORDER BY tech_name
  `).all();
  res.json({ techs: rows.map((r) => r.techName) });
});

module.exports = router;
