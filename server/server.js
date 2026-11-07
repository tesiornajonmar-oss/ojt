// OJT-ERAMS server — build 2026-11-07-c (adds POST /api/admin/admins)
require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.set('trust proxy', 1);
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

const GPS_LABEL  = { IN_RANGE: 'In-Range', MANUAL: 'Manual' };
const FACE_LABEL = { MATCH: 'Match', LOW: 'Low', NONE: 'None', NOT_ENROLLED: 'Not enrolled' };
const INFO_FLAGS = ['LATE', 'UNDERTIME', 'OVERTIME'];
const SHIFT_COLS = `s.id, s.time_in, s.time_out, s.computed_hours, s.gps_status::text AS gps_status,
  s.distance_m, s.face_in::text AS face_in, s.face_out::text AS face_out, s.status::text AS status,
  s.review_level::text AS review_level, s.approval_method::text AS approval_method, s.flags,
  s.liveness_in, s.liveness_out`;

const faceObj = (v, live) => (v ? { status: v, score: null, liveness: !!live } : null);
const uiStatus = st => (st === 'ACTIVE' ? 'TIMED_IN' : st);

function shiftOut(s) {
  return {
    id: s.id, company: s.company || null,
    time_in: s.time_in, time_out: s.time_out,
    computed_hours: num(s.computed_hours),
    gps_status: GPS_LABEL[s.gps_status] || s.gps_status,
    distance_m: s.distance_m === null || s.distance_m === undefined ? null : Math.round(Number(s.distance_m)),
    face_in: faceObj(s.face_in, s.liveness_in),
    face_out: faceObj(s.face_out, s.liveness_out),
    status: uiStatus(s.status), review_level: s.review_level,
    approval_method: s.approval_method, flags: s.flags || []
  };
}

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
              (to_jsonb(u) ->> 'must_change') = 'true' AS must_change,
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
      must_change: !!u.must_change,
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
    try { await db.query('UPDATE users SET must_change = false WHERE id = $1', [req.user.id]); }
    catch (e) { /* must_change column not created yet */ }
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
      `SELECT ${SHIFT_COLS}, c.name AS company
         FROM shifts s LEFT JOIN companies c ON c.id = s.company_id
        WHERE s.student_id = $1 AND s.time_out IS NULL
        ORDER BY s.time_in DESC LIMIT 1`, [uid])).rows[0];

    const today = (await db.query(
      `SELECT ${SHIFT_COLS}, c.name AS company
         FROM shifts s LEFT JOIN companies c ON c.id = s.company_id
        WHERE s.student_id = $1 AND s.date = ${TZ} AND s.time_out IS NOT NULL
        ORDER BY s.time_in DESC LIMIT 1`, [uid])).rows[0];

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
      active: active ? shiftOut(active) : null,
      today: today ? shiftOut(today) : null,
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
/*  Student: placement + attendance (clock in / clock out)             */
/* ------------------------------------------------------------------ */
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayIdx = arr => (arr || [])
  .map(d => /^\d$/.test(String(d)) ? Number(d) : DAY.findIndex(x => x.toLowerCase() === String(d).slice(0, 3).toLowerCase()))
  .filter(i => i >= 0 && i <= 6).sort((a, b) => a - b);
function daysText(arr) {
  const idx = dayIdx(arr);
  if (!idx.length) return '—';
  const run = idx.every((d, i) => i === 0 || d === idx[i - 1] + 1);
  return run && idx.length >= 3 ? `${DAY[idx[0]]}–${DAY[idx[idx.length - 1]]}` : idx.map(i => DAY[i]).join(', ');
}
const round2 = n => Math.round(n * 100) / 100;
const fullName = u => `${u.first_name || ''} ${u.last_name || ''}`.trim();

async function getSettings() {
  const s = {};
  (await db.query('SELECT key, value FROM settings')).rows.forEach(r => { s[r.key] = r.value; });
  const n = (k, d) => (s[k] !== undefined && s[k] !== '' && !isNaN(Number(s[k])) ? Number(s[k]) : d);
  return {
    auto_approve: s.auto_approve ? s.auto_approve === 'true' : true,
    face_required: s.face_required ? s.face_required === 'true' : true,
    face_threshold: n('face_threshold', 0.6),   // max face distance that still counts as a match
    min_shift_hours: n('min_shift_hours', 1),
    max_shift_hours: n('max_shift_hours', 14),
    break_min: n('break_min', 60),
    grace_min: n('grace_min', 0)
  };
}

async function getPlacement(uid) {
  return (await db.query(
    `SELECT p.company_id, p.required_hours, p.started_at, p.work_days,
            p.shift_start::text AS shift_start_raw, p.shift_end::text AS shift_end_raw,
            to_char(p.shift_start, 'HH12:MI AM') AS shift_start,
            to_char(p.shift_end,   'HH12:MI AM') AS shift_end,
            p.started_at::text AS start_date,
            c.name, c.address, c.industry, c.lat, c.lng, c.geofence_radius,
            c.moa_status::text AS moa_status, c.moa_expires_at::text AS moa_expires
       FROM ojt_placements p JOIN companies c ON c.id = p.company_id
      WHERE p.student_id = $1
      ORDER BY p.started_at DESC NULLS LAST LIMIT 1`, [uid])).rows[0];
}

function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function gpsCheck(coords, c) {
  if (!coords || c.lat === null || c.lng === null) return { status: 'MANUAL', distance: null };
  const lat = Number(coords.lat), lng = Number(coords.lng);
  if (!isFinite(lat) || !isFinite(lng)) return { status: 'MANUAL', distance: null };
  const d = distanceM(lat, lng, Number(c.lat), Number(c.lng));
  return { status: d <= (c.geofence_radius || 100) ? 'IN_RANGE' : 'MANUAL', distance: Math.round(d) };
}

// face_profiles.descriptors = N x 128 float32 numbers, little-endian, back to back
async function faceCheck(uid, descriptor, threshold) {
  const row = (await db.query('SELECT descriptors FROM face_profiles WHERE student_id = $1', [uid])).rows[0];
  if (!row || !row.descriptors || row.descriptors.length < 512) return 'NOT_ENROLLED';
  if (!Array.isArray(descriptor) || descriptor.length !== 128) return 'NONE';
  const buf = row.descriptors, count = Math.floor(buf.length / 512);
  let best = Infinity;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let k = 0; k < 128; k++) { const d = buf.readFloatLE(i * 512 + k * 4) - Number(descriptor[k]); sum += d * d; }
    best = Math.min(best, Math.sqrt(sum));
  }
  return best <= threshold ? 'MATCH' : 'LOW';
}

const faceFlag = r => r === 'LOW' ? 'FACE_LOW' : r === 'NONE' ? 'FACE_NONE' : r === 'NOT_ENROLLED' ? 'FACE_NOT_ENROLLED' : null;

app.get('/api/student/placement', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id;
    const p = await getPlacement(uid);
    const cfg = await getSettings();
    const prof = (await db.query(
      'SELECT program, status::text AS status FROM student_profiles WHERE user_id = $1', [uid])).rows[0] || {};
    const advisers = (await db.query(
      `SELECT u.first_name, u.last_name, u.email, u.phone
         FROM student_profiles sp JOIN users u ON u.id = sp.adviser_id
        WHERE sp.user_id = $1`, [uid])).rows;
    const supervisors = p ? (await db.query(
      `SELECT u.first_name, u.last_name, u.email, u.phone, sup.position
         FROM supervisor_profiles sup JOIN users u ON u.id = sup.user_id
        WHERE sup.company_id = $1 AND u.active = true`, [p.company_id])).rows : [];
    const history = (await db.query(
      `SELECT c.name AS company FROM ojt_placements pl JOIN companies c ON c.id = pl.company_id
        WHERE pl.student_id = $1 ORDER BY pl.started_at DESC NULLS LAST`, [uid])).rows;
    let sreq = null;
    try {
      sreq = (await db.query(
        'SELECT status, note FROM schedule_requests WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1',
        [uid])).rows[0] || null;
    } catch (e) { /* schedule_requests table not created yet */ }

    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    let moa = p ? p.moa_status : 'NONE';
    if (moa === 'ACTIVE' && p.moa_expires && p.moa_expires < today) moa = 'EXPIRED';
    let deployment = 'DEPLOYED';
    if (!p) deployment = 'UNASSIGNED';
    else if (prof.status === 'ON_HOLD') deployment = 'ON_HOLD';
    else if (prof.status === 'COMPLETED') deployment = 'COMPLETED';
    else if (moa !== 'ACTIVE') deployment = 'AWAITING_CONTRACT';
    else if (p.start_date && p.start_date > today) deployment = 'SCHEDULED';

    res.json({
      user: { program: prof.program },
      status: prof.status,
      deployment,
      company: p ? { id: p.company_id, name: p.name, address: p.address, industry: p.industry,
                     geofence_radius: p.geofence_radius,
                     moa_effective: ({ ACTIVE: 'APPROVED', NONE: 'NOT_REQUIRED' })[moa] || moa } : null,
      ojt: p ? { shift_start: p.shift_start, shift_end: p.shift_end, work_days: daysText(p.work_days),
                 target_hours: num(p.required_hours), start_date: p.start_date, end_date: null } : null,
      schedule: p ? { days: dayIdx(p.work_days), days_label: daysText(p.work_days),
                      start: p.shift_start, end: p.shift_end, break_min: cfg.break_min }
                  : { days: [], days_label: '—', start: '', end: '', break_min: cfg.break_min },
      schedule_request: sreq,
      placements: history,
      advisers: advisers.map(a => ({ name: fullName(a), email: a.email, phone: a.phone })),
      supervisors: supervisors.map(a => ({ name: fullName(a), email: a.email, phone: a.phone, position: a.position }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load placement' });
  }
});

/* ---------- Face ID ---------- */
app.get('/api/student/face', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const row = (await db.query(
      'SELECT descriptors, enrolled_at FROM face_profiles WHERE student_id = $1', [req.user.id])).rows[0];
    const cfg = await getSettings();
    res.json({
      enrolled: !!(row && row.descriptors && row.descriptors.length >= 512),
      enrolled_at: row ? row.enrolled_at : null,
      shots: row && row.descriptors ? Math.floor(row.descriptors.length / 512) : 0,
      face_required: cfg.face_required
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load Face ID status' });
  }
});

app.post('/api/student/face', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id;
    const { descriptors, photo, consent } = req.body || {};
    if (consent !== true) return res.status(400).json({ error: 'Your consent is required to set up Face ID.' });
    if (!Array.isArray(descriptors) || descriptors.length < 1 || descriptors.length > 5 ||
        !descriptors.every(d => Array.isArray(d) && d.length === 128 && d.every(x => typeof x === 'number' && isFinite(x))))
      return res.status(400).json({ error: 'The face photos were not valid. Please try again.' });
    if (typeof photo !== 'string' || !photo.startsWith('data:image/'))
      return res.status(400).json({ error: 'A reference photo is required.' });
    if ((await db.query('SELECT 1 FROM face_profiles WHERE student_id = $1', [uid])).rowCount)
      return res.status(409).json({ error: 'Face ID is already set up. Ask your adviser to reset it first.' });

    const buf = Buffer.alloc(descriptors.length * 512);
    descriptors.forEach((d, i) => d.forEach((x, k) => buf.writeFloatLE(x, i * 512 + k * 4)));
    await db.query(
      `INSERT INTO face_profiles (student_id, descriptors, photo, consented_at, enrolled_at)
       VALUES ($1, $2, $3, now(), now())`, [uid, buf, photo]);
    try {
      await db.query(`INSERT INTO audit_log (user_id, action, subject, detail, ip) VALUES ($1, 'FACE_ENROLLED', $1::text, $2, $3)`,
        [uid, descriptors.length + ' shots', req.ip || null]);
    } catch (e) { /* audit is best-effort */ }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save Face ID: ' + e.message });
  }
});

/* ---------- schedule change request (needs the schedule_requests table) ---------- */
app.post('/api/student/schedule-request', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id;
    const { days, start, end, break_min, reason } = req.body || {};
    const d = Array.isArray(days) ? days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : [];
    if (!d.length) return res.status(400).json({ error: 'Choose at least one work day.' });
    if (!start || !end) return res.status(400).json({ error: 'Set a start and end time.' });
    if ((await db.query("SELECT 1 FROM schedule_requests WHERE student_id = $1 AND status = 'PENDING'", [uid])).rowCount)
      return res.status(409).json({ error: 'You already have a request waiting for approval.' });
    await db.query(
      `INSERT INTO schedule_requests (student_id, days, start_time, end_time, break_min, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uid, d, start, end, Number(break_min) || 60, String(reason || '').slice(0, 500)]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '42P01') return res.status(501).json({ error: 'Schedule requests are not set up yet.' });
    if (e.code === '22007' || e.code === '22P02') return res.status(400).json({ error: 'Please check the times you entered.' });
    console.error(e);
    res.status(500).json({ error: 'Could not send the request' });
  }
});

app.post('/api/student/attendance/clock-in', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id;
    const { coords, photo, face } = req.body || {};

    const st = (await db.query('SELECT status::text AS status FROM student_profiles WHERE user_id = $1', [uid])).rows[0];
    if (st && st.status === 'ON_HOLD') return res.status(403).json({ error: 'Your OJT is on hold. Please contact your adviser.' });
    if (st && st.status === 'COMPLETED') return res.status(403).json({ error: 'Your OJT is already completed.' });

    const p = await getPlacement(uid);
    if (!p) return res.status(400).json({ error: 'No company is assigned to you yet.' });
    if (!photo) return res.status(400).json({ error: 'A live photo is required.' });

    if ((await db.query('SELECT 1 FROM shifts WHERE student_id = $1 AND time_out IS NULL', [uid])).rowCount)
      return res.status(409).json({ error: 'You are still clocked in. Please clock out first.' });
    if ((await db.query(`SELECT 1 FROM shifts WHERE student_id = $1 AND date = ${TZ}`, [uid])).rowCount)
      return res.status(409).json({ error: "Today's shift is already submitted." });

    const cfg = await getSettings();
    const g = gpsCheck(coords, p);
    const faceRes = await faceCheck(uid, face && face.descriptor, cfg.face_threshold);
    const live = !!(face && face.liveness);

    const flags = [];
    if (g.status === 'MANUAL') flags.push('MANUAL_GPS');
    if (faceFlag(faceRes)) flags.push(faceFlag(faceRes));
    if ((faceRes === 'MATCH' || faceRes === 'LOW') && !live) flags.push('NO_LIVENESS');

    const ins = await db.query(
      `INSERT INTO shifts (student_id, company_id, date, time_in, lat_in, lng_in, distance_m,
                           gps_status, photo_in, face_in, liveness_in, flags, risk, status,
                           client_ip, user_agent)
       VALUES ($1, $2, ${TZ}, now(), $3, $4, $5, $6, $7, $8, $9, $10, 'LOW', 'ACTIVE', $11, $12)
       RETURNING id`,
      [uid, p.company_id,
       coords && isFinite(Number(coords.lat)) ? Number(coords.lat) : null,
       coords && isFinite(Number(coords.lng)) ? Number(coords.lng) : null,
       g.distance, g.status, photo, faceRes, live, flags,
       req.ip || null, (req.headers['user-agent'] || '').slice(0, 300)]);

    res.json({ shift: { id: ins.rows[0].id, gps_status: GPS_LABEL[g.status],
                        distance_m: g.distance, face_in: { status: faceRes, score: null, liveness: live } } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not clock in: ' + e.message });
  }
});

app.post('/api/student/attendance/clock-out', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id;
    const { coords, photo, face } = req.body || {};

    const s = (await db.query(
      `SELECT id, company_id, time_in, flags, gps_status::text AS gps_status,
              face_in::text AS face_in, liveness_in
         FROM shifts WHERE student_id = $1 AND time_out IS NULL
        ORDER BY time_in DESC LIMIT 1`, [uid])).rows[0];
    if (!s) return res.status(409).json({ error: 'You are not clocked in.' });
    if (!photo) return res.status(400).json({ error: 'A live photo is required.' });

    const p = await getPlacement(uid);
    const cfg = await getSettings();
    const g = p ? gpsCheck(coords, p) : { status: 'MANUAL', distance: null };
    const faceOut = await faceCheck(uid, face && face.descriptor, cfg.face_threshold);
    const liveOut = !!(face && face.liveness);

    // ---- time math (all schedule times are Manila time, UTC+8) ----
    const now = new Date(), tin = new Date(s.time_in);
    const grossMin = Math.max(0, (now - tin) / 60000);
    const breakMin = grossMin >= 300 ? cfg.break_min : 0;       // lunch deducted from shifts of 5h+
    const netMin = Math.max(0, grossMin - breakMin);
    let late = 0, under = 0, ot = 0;
    if (p) {
      const ymd = new Date(tin.getTime() + 8 * 3600000).toISOString().slice(0, 10);
      const at = t => new Date(`${ymd}T${t.slice(0, 8)}+08:00`);
      const start = at(p.shift_start_raw), end = at(p.shift_end_raw);
      late = Math.max(0, Math.round((tin - start) / 60000) - cfg.grace_min);
      if (now < end) under = Math.round((end - now) / 60000); else ot = Math.round((now - end) / 60000);
    }
    ot = Math.min(ot, Math.round(netMin));
    const regularHours = round2(Math.max(0, netMin - ot) / 60);   // overtime only counts once a supervisor approves it
    const netHours = netMin / 60;

    // ---- flags ----
    const set = new Set(s.flags || []);
    if (g.status === 'MANUAL') set.add('MANUAL_GPS');
    if (faceFlag(faceOut)) set.add(faceFlag(faceOut));
    if ((faceOut === 'MATCH' || faceOut === 'LOW') && !liveOut) set.add('NO_LIVENESS');
    if (netHours < cfg.min_shift_hours) set.add('SHORT_SHIFT');
    if (netHours > cfg.max_shift_hours) set.add('LONG_SHIFT');
    if (late > 0) set.add('LATE');
    if (under > 0) set.add('UNDERTIME');
    if (ot > 0) set.add('OVERTIME');
    const flags = [...set];
    const blocking = flags.filter(f => !INFO_FLAGS.includes(f));

    // ---- approval rules ----
    const risk = blocking.some(f => ['FACE_LOW', 'SHORT_SHIFT', 'LONG_SHIFT'].includes(f)) ? 'HIGH'
               : blocking.length ? 'MEDIUM' : 'LOW';
    const auto = cfg.auto_approve && blocking.length === 0;
    const hasSup = (await db.query('SELECT 1 FROM supervisor_profiles WHERE company_id = $1 LIMIT 1', [s.company_id])).rowCount > 0;
    const level = hasSup ? 'SUPERVISOR' : 'ADVISER';
    const outcome = auto ? 'AUTO_APPROVED' : hasSup ? 'PENDING_SUPERVISOR' : 'PENDING_ADVISER';

    await db.query(
      `UPDATE shifts SET time_out = now(), photo_out = $2, face_out = $3, liveness_out = $4,
              computed_hours = $5, flags = $6, risk = $7, status = $8, review_level = $9,
              approval_method = $10, verified_at = CASE WHEN $11::boolean THEN now() ELSE NULL END
        WHERE id = $1`,
      [s.id, photo, faceOut, liveOut, regularHours, flags, risk,
       auto ? 'APPROVED' : 'PENDING_VERIFICATION', level, auto ? 'AUTO' : null, auto]);

    res.json({
      shift: { id: s.id, late_min: late, under_min: under, ot_hours: round2(ot / 60),
               regular_hours: regularHours, gps_status: GPS_LABEL[g.status] },
      outcome, flags
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not clock out: ' + e.message });
  }
});

/* ------------------------------------------------------------------ */
/*  DTR (student's own Daily Time Record)                              */
/* ------------------------------------------------------------------ */
const ymdOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const dowOf = ymd => new Date(ymd + 'T00:00:00Z').getUTCDay();
const addDay = ymd => new Date(new Date(ymd + 'T00:00:00Z').getTime() + 864e5).toISOString().slice(0, 10);

// late / undertime / overtime in minutes, measured against the placement schedule (Manila time)
function scheduleDiff(tin, tout, p, graceMin) {
  const r = { late: 0, under: 0, ot: 0 };
  if (!p || !tin) return r;
  const ymd = new Date(new Date(tin).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const at = t => new Date(`${ymd}T${t.slice(0, 8)}+08:00`);
  r.late = Math.max(0, Math.round((new Date(tin) - at(p.shift_start_raw)) / 60000) - graceMin);
  if (tout) {
    const end = at(p.shift_end_raw), o = new Date(tout);
    if (o < end) r.under = Math.round((end - o) / 60000); else r.ot = Math.round((o - end) / 60000);
  }
  return r;
}

app.get('/api/dtr', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id;
    const { from, to } = req.query;
    if (!ymdOk(from) || !ymdOk(to) || from > to) return res.status(400).json({ error: 'Choose a valid period.' });
    if ((new Date(to) - new Date(from)) / 864e5 > 92) return res.status(400).json({ error: 'Please choose a period of 3 months or less.' });

    const p = await getPlacement(uid);
    const cfg = await getSettings();
    const info = (await db.query(
      `SELECT u.first_name, u.last_name, sp.student_no, sp.program, sp.year_section
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = $1`, [uid])).rows[0] || {};
    const sups = p ? (await db.query(
      `SELECT u.first_name, u.last_name FROM supervisor_profiles sup JOIN users u ON u.id = sup.user_id
        WHERE sup.company_id = $1 AND u.active = true`, [p.company_id])).rows.map(fullName) : [];

    const hol = {};
    const hs = (await db.query("SELECT value FROM settings WHERE key = 'holidays'")).rows[0];
    try { JSON.parse(hs.value).forEach(h => { if (h && h.date) hol[String(h.date).slice(0, 10)] = h.name || 'Holiday'; }); } catch (e) { /* no holidays set */ }

    const byDate = {};
    (await db.query(
      `SELECT s.id, s.date::text AS date, s.time_in, s.time_out, s.computed_hours,
              s.status::text AS status, s.approval_method::text AS approval_method,
              s.review_level::text AS review_level, s.flags, vu.first_name, vu.last_name
         FROM shifts s LEFT JOIN users vu ON vu.id = s.verified_by
        WHERE s.student_id = $1 AND s.date BETWEEN $2 AND $3
        ORDER BY s.date, s.time_in`, [uid, from, to])).rows
      .forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });

    const work = p ? dayIdx(p.work_days) : [];
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const startDate = p && p.start_date ? p.start_date : from;
    const rows = [];
    const t = { present: 0, required_days: 0, absent: 0, late_min: 0, late_count: 0, under_min: 0,
                ot_hours: 0, ot_approved: 0, counted_hours: 0, pending_count: 0 };

    for (let d = from; d <= to; d = addDay(d)) {
      const dow = dowOf(d), list = byDate[d] || [];
      const scheduled = !!p && work.includes(dow) && d >= startDate;
      if (scheduled && !hol[d]) t.required_days++;

      if (!list.length) {
        if (p && d < startDate) continue;                       // before the training began
        let state = 'REST';
        if (hol[d]) state = 'HOLIDAY';
        else if (scheduled) state = d < today ? 'ABSENT' : d === today ? 'TODAY' : 'UPCOMING';
        if (state === 'ABSENT') t.absent++;
        rows.push({ date: d, dow, state, holiday: hol[d] || null, shift_id: null });
        continue;
      }

      if (list.some(s => s.status !== 'REJECTED')) t.present++;
      for (const s of list) {
        const sd = scheduled ? scheduleDiff(s.time_in, s.time_out, p, cfg.grace_min) : { late: 0, under: 0, ot: 0 };
        const counted = s.status === 'APPROVED' ? num(s.computed_hours) : 0;
        t.late_min += sd.late; if (sd.late > 0) t.late_count++;
        t.under_min += sd.under; t.ot_hours += sd.ot / 60; t.counted_hours += counted;
        if (s.status === 'PENDING_VERIFICATION') t.pending_count++;
        rows.push({
          date: d, dow, state: s.time_out ? 'DONE' : 'ACTIVE', holiday: null, shift_id: s.id,
          time_in: s.time_in, time_out: s.time_out,
          regular_hours: num(s.computed_hours),
          late_min: sd.late, under_min: sd.under,
          ot_hours: round2(sd.ot / 60), ot_status: 'PENDING',   // overtime counts only after a supervisor approves it
          counted_hours: counted,
          status: uiStatus(s.status), review_level: s.review_level, approval_method: s.approval_method,
          verified_by: s.first_name ? fullName(s) : null,
          flags: [...(s.flags || []), ...(p && !scheduled ? ['OFF_SCHEDULE'] : [])]
        });
      }
    }
    t.ot_hours = round2(t.ot_hours); t.counted_hours = round2(t.counted_hours);

    res.json({
      student: { name: fullName(info), sid: info.student_no, program: info.program, section: info.year_section },
      company: p ? { name: p.name } : null,
      supervisors: sups,
      period: { from, to },
      schedule: p ? { days_label: daysText(p.work_days), start: p.shift_start, end: p.shift_end,
                      break_min: cfg.break_min, grace_min: cfg.grace_min }
                  : { days_label: '—', start: '', end: '', break_min: cfg.break_min, grace_min: cfg.grace_min },
      target: p ? num(p.required_hours) : null,
      totals: t, rows,
      certification: null, can_certify: false
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load the DTR' });
  }
});

/* ------------------------------------------------------------------ */
/*  Accomplishments + Narrative reports (student)                      */
/* ------------------------------------------------------------------ */
const httpErr = (status, msg) => Object.assign(new Error(msg), { status });
const bad = msg => httpErr(400, msg);
const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const manilaToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const sendErr = (res, e, fallback) => {
  if (e.status) return res.status(e.status).json({ error: e.message });
  console.error(e);
  res.status(500).json({ error: fallback });
};

function cleanFiles(list, { min, max, mimes, maxChars, what }) {
  list = Array.isArray(list) ? list : [];
  if (list.length < min) throw bad(`Please add at least ${min} ${what}.`);
  if (list.length > max) throw bad(`You can add up to ${max} ${what}s.`);
  return list.map(f => {
    const type = String((f && f.type) || ''), data = String((f && f.data) || '');
    if (!mimes.includes(type) || !data.startsWith('data:' + type)) throw bad('One of the files is not an allowed type.');
    if (data.length > maxChars) throw bad('One of the files is too large.');
    return { name: String((f && f.name) || 'file').slice(0, 120), type, data };
  });
}

const ACC_SQL = `SELECT a.id, a.date::text AS date, a.title, a.description, a.hours, a.evidence, a.status,
        a.feedback, vu.first_name AS vfirst, vu.last_name AS vlast
   FROM accomplishments a LEFT JOIN users vu ON vu.id = a.verified_by`;
const accOut = a => ({
  id: a.id, date: a.date, title: a.title, description: a.description, hours: num(a.hours),
  evidence: a.evidence || [], status: a.status, feedback: a.feedback || '',
  verified_by: a.vfirst ? fullName({ first_name: a.vfirst, last_name: a.vlast }) : null
});

app.get('/api/student/accomplishments', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const rows = (await db.query(ACC_SQL + ' WHERE a.student_id = $1 ORDER BY a.date DESC, a.created_at DESC', [req.user.id])).rows;
    res.json(rows.map(accOut));
  } catch (e) { sendErr(res, e, 'Could not load accomplishments'); }
});

app.post('/api/student/accomplishments', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id, b = req.body || {};
    const title = String(b.title || '').trim(), desc = String(b.description || '').trim();
    const hours = Number(b.hours), date = String(b.date || '');
    if (!title) throw bad('Please write a title.');
    if (title.length > 120) throw bad('The title is too long (120 characters max).');
    if (!desc) throw bad('Please describe what you did.');
    if (!(hours >= 0.25 && hours <= 24)) throw bad('Hours must be between 0.25 and 24.');
    if (!ymdOk(date) || date > manilaToday()) throw bad('Choose a valid date (not in the future).');
    const evidence = cleanFiles(b.evidence, { min: 1, max: 4, mimes: ['image/jpeg', 'image/png', 'image/webp'], maxChars: 1.5e6, what: 'photo' });

    if (b.id) {
      if (!isUuid(b.id)) throw httpErr(404, 'Accomplishment not found.');
      const cur = (await db.query('SELECT status FROM accomplishments WHERE id = $1 AND student_id = $2', [b.id, uid])).rows[0];
      if (!cur) throw httpErr(404, 'Accomplishment not found.');
      if (cur.status === 'VERIFIED') throw httpErr(409, 'A verified accomplishment cannot be changed.');
      await db.query(
        `UPDATE accomplishments SET date = $3, title = $4, description = $5, hours = $6, evidence = $7::jsonb,
                status = 'SUBMITTED', feedback = NULL, verified_by = NULL, verified_at = NULL, updated_at = now()
          WHERE id = $1 AND student_id = $2`, [b.id, uid, date, title, desc, hours, JSON.stringify(evidence)]);
    } else {
      await db.query(
        `INSERT INTO accomplishments (student_id, date, title, description, hours, evidence)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [uid, date, title, desc, hours, JSON.stringify(evidence)]);
    }
    res.json({ ok: true });
  } catch (e) { sendErr(res, e, 'Could not save the accomplishment'); }
});

app.delete('/api/student/accomplishments/:id', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) throw httpErr(404, 'Accomplishment not found.');
    const r = await db.query(
      "DELETE FROM accomplishments WHERE id = $1 AND student_id = $2 AND status <> 'VERIFIED'", [req.params.id, req.user.id]);
    if (!r.rowCount) throw httpErr(409, 'It was not found, or it is already verified and cannot be deleted.');
    await db.query('UPDATE reports SET accomplishment_ids = array_remove(accomplishment_ids, $1::uuid) WHERE student_id = $2',
      [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { sendErr(res, e, 'Could not delete the accomplishment'); }
});

app.get('/api/student/reports', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id;
    const rows = (await db.query(
      `SELECT id, date::text AS date, title, body, status::text AS status, feedback, attachments, accomplishment_ids
         FROM reports WHERE student_id = $1 ORDER BY date DESC, submitted_at DESC NULLS LAST`, [uid])).rows;
    const byId = {};
    (await db.query(ACC_SQL + ' WHERE a.student_id = $1', [uid])).rows.forEach(a => { byId[a.id] = accOut(a); });
    res.json(rows.map(r => ({
      id: r.id, date: r.date, title: r.title, body: r.body || '', status: r.status, feedback: r.feedback || '',
      attachments: r.attachments || [], accomplishment_ids: r.accomplishment_ids || [],
      accomplishments: (r.accomplishment_ids || []).map(i => byId[i]).filter(Boolean)
    })));
  } catch (e) { sendErr(res, e, 'Could not load your reports'); }
});

app.post('/api/student/reports', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id, b = req.body || {};
    const title = String(b.title || '').trim(), body = String(b.body || '').trim();
    const date = b.date ? String(b.date) : manilaToday(), submit = !!b.submit;
    if (!title) throw bad('Please write a title.');
    if (title.length > 90) throw bad('The title is too long (90 characters max).');
    if (!ymdOk(date) || date > manilaToday()) throw bad('Choose a valid date (not in the future).');
    const attachments = cleanFiles(b.attachments, { min: 0, max: 3, mimes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], maxChars: 2.8e6, what: 'file' });
    if (submit && !body && !attachments.length) throw bad('Write your narrative or attach your written report before submitting.');

    const asked = (Array.isArray(b.accomplishment_ids) ? b.accomplishment_ids : []).filter(isUuid);
    const accIds = asked.length ? (await db.query(
      'SELECT id FROM accomplishments WHERE student_id = $1 AND id = ANY($2::uuid[])', [uid, asked])).rows.map(r => r.id) : [];
    const status = submit ? 'PENDING' : 'DRAFT';

    if (b.id) {
      if (!isUuid(b.id)) throw httpErr(404, 'Report not found.');
      const cur = (await db.query('SELECT status::text AS status FROM reports WHERE id = $1 AND student_id = $2', [b.id, uid])).rows[0];
      if (!cur) throw httpErr(404, 'Report not found.');
      if (!['DRAFT', 'REVISION'].includes(cur.status)) throw httpErr(409, 'This report can no longer be edited.');
      await db.query(
        `UPDATE reports SET date = $3, title = $4, body = $5, attachments = $6::jsonb, accomplishment_ids = $7::uuid[],
                status = $8, submitted_at = CASE WHEN $9::boolean THEN now() ELSE NULL END,
                feedback = CASE WHEN $9::boolean THEN NULL ELSE feedback END
          WHERE id = $1 AND student_id = $2`,
        [b.id, uid, date, title, body, JSON.stringify(attachments), accIds, status, submit]);
    } else {
      await db.query(
        `INSERT INTO reports (student_id, date, title, body, status, attachments, accomplishment_ids, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::uuid[], CASE WHEN $8::boolean THEN now() ELSE NULL END)`,
        [uid, date, title, body, status, JSON.stringify(attachments), accIds, submit]);
    }
    res.json({ ok: true });
  } catch (e) { sendErr(res, e, 'Could not save the report'); }
});

app.delete('/api/student/reports/:id', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) throw httpErr(404, 'Report not found.');
    const r = await db.query("DELETE FROM reports WHERE id = $1 AND student_id = $2 AND status = 'DRAFT'", [req.params.id, req.user.id]);
    if (!r.rowCount) throw httpErr(409, 'Only drafts can be deleted.');
    res.json({ ok: true });
  } catch (e) { sendErr(res, e, 'Could not delete the report'); }
});

/* ------------------------------------------------------------------ */
/*  Super Admin: accounts                                              */
/* ------------------------------------------------------------------ */
app.post('/api/admin/admins', auth(['SUPER_ADMIN']), async (req, res) => {
  try {
    const b = req.body || {};
    const first = String(b.first_name || '').trim(), last = String(b.last_name || '').trim();
    const email = String(b.email || '').trim(), username = String(b.username || '').trim().toLowerCase();
    const password = String(b.password || ''), dept = String(b.department || b.title || '').trim();
    if (!first || !last) throw bad('Please enter the first and last name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please enter a valid email address.');
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw bad('Username must be 3–40 characters: letters, numbers, dot, dash or underscore.');
    if (password.length < 6) throw bad('The temporary password must be at least 6 characters.');
    if ((await db.query('SELECT 1 FROM users WHERE lower(username) = $1', [username])).rowCount)
      throw httpErr(409, 'That username is already taken.');

    await db.query(
      `INSERT INTO users (username, password_hash, role, first_name, last_name, title, email, active, must_change)
       VALUES ($1, $2, 'SUPER_ADMIN', $3, $4, $5, $6, true, true)`,
      [username, await bcrypt.hash(password, 10), first, last, dept || null, email]);
    try {
      await db.query(`INSERT INTO audit_log (user_id, action, subject, detail, ip) VALUES ($1, 'ADMIN_CREATED', $2, $3, $4)`,
        [req.user.id, username, 'New administrator account', req.ip || null]);
    } catch (e) { /* audit is best-effort */ }
    res.json({ ok: true, username });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That username is already taken.' });
    if (e.code === '42703') return res.status(500).json({ error: 'The users table needs the must_change column. Run the SQL from the chat first.' });
    sendErr(res, e, 'Could not create the account');
  }
});

/* ------------------------------------------------------------------ */
app.listen(process.env.PORT || 3000, () =>
  console.log('Running on port ' + (process.env.PORT || 3000)));