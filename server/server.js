require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(express.json());

// Serve the front end from the same server
app.use(express.static(path.join(__dirname, '..')));

// Test: is the database connected?
app.get('/api/health', async (req, res) => {
  try {
    const r = await db.query('SELECT COUNT(*) FROM settings');
    res.json({ ok: true, settings_rows: r.rows[0].count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const ROLE = { student: 'EDUC_INTERN', faculty: 'ADVISER',
               supervisor: 'SUPERVISOR', superadmin: 'SUPER_ADMIN' };

app.post('/api/auth/login', async (req, res) => {
  try {
    const { portal, username, password } = req.body;
    const r = await db.query(
      'SELECT * FROM users WHERE username = $1 AND role = $2 AND active = true',
      [username, ROLE[portal]]
    );
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash)))
      return res.status(401).json({ error: 'Wrong username or password' });

    const token = jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET,
                           { expiresIn: '8h' });
    res.json({ token, user: { id: u.id, role: u.role, username: u.username,
              first_name: u.first_name, last_name: u.last_name } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT, () =>
  console.log('Running at http://localhost:' + process.env.PORT));