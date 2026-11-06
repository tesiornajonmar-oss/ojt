require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Never let the browser download the backend's own files
app.use('/server', (req, res) => res.status(404).end());

// Serve the front end (one folder up from /server)
app.use(express.static(path.join(__dirname, '..')));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const ROLE = { student: 'EDUC_INTERN', faculty: 'ADVISER',
               supervisor: 'SUPERVISOR', superadmin: 'SUPER_ADMIN' };

function auth(roles = []) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    try {
      const p = jwt.verify(token, process.env.JWT_SECRET);
      if (roles.length && !roles.includes(p.role))
        return res.status(403).json({ error: 'Not allowed' });
      req.user = p;
      next();
    } catch {
      res.status(401).json({ error: 'Session expired, please sign in again' });
    }
  };
}

const num = v => (v === null || v === undefined ? 0 : Number(v));
const TZ = "(now() AT TIME ZONE 'Asia/Manila')::date";

/* ------------------------------------------------------------------ */
/*  Health check                                                       */
/* ------------------------------------------------------------------ */
app.get('/api/health', async (req, res) => {
  try {
    const r = await db.query('SELECT COUNT(*) FROM settings');
    res.json({ ok: true, settings_rows: r.rows[0].count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */
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

app.get('/api/auth/me', auth(), async (req, res) => {
  try {
    const u = (await db.query(
      `SELECT u.id, u.role::text AS role, u.username, u.first_name, u.last_name,
              u.title, u.email, u.phone, u.theme,
              sp.student_no, sp.program, sp.year_section,
              sup.position, c.name AS company_name
         FROM users u
         LEFT JOIN student_profiles sp     ON sp.user_id = u.id
         LEFT JOIN supervisor_profiles sup ON sup.user_id = u.id
         LEFT JOIN companies c             ON c.id = sup.company_id
        WHERE u.id = $1 AND u.active = true`, [req.user.id])).rows[0];
    if (!u) return res.status(401).json({ error: 'Account not found or disabled' });

    res.json({
      id: u.id, role: u.role, username: u.username,
      first_name: u.first_name, last_name: u.last_name,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      email: u.email, phone: u.phone, theme: u.theme,
      student_id: u.student_no, program: u.program, section: u.year_section,
      position: u.position, company_name: u.company_name,
      department: u.title,
      must_change: false,
      badges: { approvals: 0, messages: 0 }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load profile' });
  }
});

app.post('/api/auth/logout', auth(), (req, res) => res.json({ ok: true }));

app.put('/api/auth/theme', auth(), async (req, res) => {
  const t = req.body.theme === 'dark' ? 'dark' : 'light';
  await db.query('UPDATE users SET theme = $1 WHERE id = $2', [t, req.user.id]);
  res.json({ ok: true });
});

app.put('/api/auth/profile', auth(), async (req, res) => {
  const { email, phone } = req.body;
  await db.query('UPDATE users SET email = $1, phone = $2 WHERE id = $3',
    [String(email || '').trim() || null, String(phone || '').trim() || null, req.user.id]);
  res.json({ ok: true });
});

app.post('/api/auth/change-password', auth(), async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    const u = (await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])).rows[0];
    if (!u || !(await bcrypt.compare(old_password || '', u.password_hash)))
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2',
      [await bcrypt.hash(new_password, 10), req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not change password' });
  }
});

/* ------------------------------------------------------------------ */
/*  Notifications (bell)                                               */
/* ------------------------------------------------------------------ */
app.get('/api/notifications', auth(), async (req, res) => {
  try {
    const items = (await db.query(
      `SELECT id, text, link, at, read FROM notifications
        WHERE user_id = $1 ORDER BY at DESC LIMIT 20`, [req.user.id])).rows;
    const unread = (await db.query(
      'SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read = false',
      [req.user.id])).rows[0].n;
    res.json({ items, unread });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load notifications' });
  }
});

app.post('/api/notifications/read', auth(), async (req, res) => {
  const { id } = req.body || {};
  if (id) await db.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  else    await db.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  Student dashboard                                                  */
/* ------------------------------------------------------------------ */
app.get('/api/student/dashboard', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id;

    const prof = (await db.query(
      `SELECT u.id, sp.student_no, sp.adviser_id, sp.status::text AS status
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE u.id = $1`, [uid])).rows[0];
    if (!prof) return res.status(404).json({ error: 'Student not found' });

    const hrs = (await db.query(
      'SELECT approved_hours, required_hours FROM v_student_hours WHERE student_id = $1',
      [uid])).rows[0];
    const target = num(hrs && hrs.required_hours) || 370;
    const total = num(hrs && hrs.approved_hours);

    const pend = (await db.query(
      `SELECT COALESCE(SUM(computed_hours), 0) AS h FROM shifts
        WHERE student_id = $1 AND status::text = 'PENDING_VERIFICATION'`, [uid])).rows[0];

    const active = (await db.query(
      `SELECT s.time_in, c.name AS company
         FROM shifts s LEFT JOIN companies c ON c.id = s.company_id
        WHERE s.student_id = $1 AND s.time_in IS NOT NULL AND s.time_out IS NULL
        ORDER BY s.time_in DESC LIMIT 1`, [uid])).rows[0];

    const today = (await db.query(
      `SELECT id FROM shifts WHERE student_id = $1 AND date = ${TZ} LIMIT 1`, [uid])).rows[0];

    const feed = (await db.query(
      `SELECT to_char(date, 'Mon DD, YYYY') AS d,
              to_char(time_in  AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS t_in,
              to_char(time_out AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS t_out,
              status::text AS status
         FROM shifts WHERE student_id = $1
        ORDER BY date DESC, time_in DESC NULLS LAST LIMIT 8`, [uid])).rows
      .map(r => ({
        label: r.d + (r.t_in ? ' · ' + r.t_in + (r.t_out ? ' – ' + r.t_out : '') : ''),
        status: r.status
      }));

    const announcements = (await db.query(
      `SELECT a.id, a.title, a.body AS message, lower(a.priority) AS priority,
              a.created_at AS created,
              COALESCE(NULLIF(trim(u.first_name || ' ' || u.last_name), ''), 'Admin') AS author
         FROM announcements a LEFT JOIN users u ON u.id = a.created_by
        WHERE a.active = true
          AND (a.expires_at IS NULL OR a.expires_at >= ${TZ})
          AND (a.audience = 'ALL' OR a.audience = $1)
        ORDER BY a.created_at DESC`, [String(prof.adviser_id || '')])).rows;

    const enrolled = (await db.query(
      'SELECT 1 FROM face_profiles WHERE student_id = $1', [uid])).rowCount > 0;
    const fr = (await db.query("SELECT value FROM settings WHERE key = 'face_required'")).rows[0];

    res.json({
      user: { student_id: prof.student_no || prof.id },
      status: prof.status,
      hours: {
        total, target,
        pct: target ? Math.min(100, Math.round((total / target) * 100)) : 0,
        remaining: Math.max(0, target - total),
        pending: num(pend.h)
      },
      active: active || null,
      today: today || null,
      feed, announcements,
      face: { enrolled },
      policy: { face_required: fr ? fr.value === 'true' : true }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load dashboard' });
  }
});

/* ------------------------------------------------------------------ */
app.listen(process.env.PORT || 3000, () =>
  console.log('Running on port ' + (process.env.PORT || 3000)));