const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at').all();
  res.json({ users });
});

router.post('/', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !['admin', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'username, password, and a valid role are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);
  res.json({ id: result.lastInsertRowid, username, role });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.session.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account while logged in' });
  }

  // Uploads and deletion history reference the user who made them; keep that history intact
  // (just anonymized) instead of leaving it dangling or blocking removal of a former teammate.
  const transaction = db.transaction(() => {
    db.prepare('UPDATE uploads SET uploaded_by = NULL WHERE uploaded_by = ?').run(id);
    db.prepare('UPDATE deletions SET deleted_by = NULL WHERE deleted_by = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  transaction();

  res.json({ ok: true });
});

module.exports = router;
