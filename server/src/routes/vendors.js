const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT vendor_id AS vendorId, vendor_name AS vendorName FROM reviews
    WHERE vendor_id IS NOT NULL AND vendor_id != '' AND deleted_at IS NULL
    ORDER BY vendor_id
  `).all();
  res.json({ vendors: rows });
});

module.exports = router;
