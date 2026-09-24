require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const db = require('./db');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/uploads');
const reviewRoutes = require('./routes/reviews');
const analyticsRoutes = require('./routes/analytics');
const techRoutes = require('./routes/techs');
const vendorRoutes = require('./routes/vendors');
const userRoutes = require('./routes/users');
const deletionRoutes = require('./routes/deletions');
const chatRoutes = require('./routes/chat');

const PORT = process.env.PORT || 4000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

// Seed the first admin account if no users exist yet.
const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
if (userCount === 0) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, 'admin');
  console.log(`Created initial admin account "${username}". Log in and consider adding more accounts.`);
}

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      sameSite: 'lax',
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/techs', techRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/users', userRoutes);
app.use('/api/deletions', deletionRoutes);
app.use('/api/chat', chatRoutes);

// In production, serve the built React app for everything else.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Tech reviews server running at http://localhost:${PORT}`);
});
