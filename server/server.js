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
  s.review_level::text AS review_level, s.approval_method::text AS approval_method, s.flags`;

function shiftOut(s) {
  return {
    id: s.id, company: s.company || null,
    time_in: s.time_in, time_out: s.time_out,
    computed_hours: num(s.computed_hours),
    gps_status: GPS_LABEL[s.gps_status] || s.gps_status,
    distance_m: s.distance_m === null || s.distance_m === undefined ? null : Math.round(Number(s.distance_m)),
    face_in: FACE_LABEL[s.face_in] || s.face_in,
    face_out: FACE_LABEL[s.face_out] || s.face_out,
    status: s.status, review_level: s.review_level,
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
const daysText = arr => (!arr || !arr.length) ? '—'
  : arr.map(d => /^\d$/.test(String(d)) ? DAY[Number(d)] : String(d)).join(', ');
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
            c.name, c.address, c.lat, c.lng, c.geofence_radius
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

const faceFlag = r => r === 'LOW' ? 'FACE_MISMATCH' : r === 'NONE' ? 'NO_FACE_CHECK' : r === 'NOT_ENROLLED' ? 'FACE_NOT_ENROLLED' : null;

app.get('/api/student/placement', auth(['EDUC_INTERN']), async (req, res) => {
  try {
    const uid = req.user.id;
    const p = await getPlacement(uid);
    const advisers = (await db.query(
      `SELECT u.first_name, u.last_name, u.email, u.phone
         FROM student_profiles sp JOIN users u ON u.id = sp.adviser_id
        WHERE sp.user_id = $1`, [uid])).rows;
    const supervisors = p ? (await db.query(
      `SELECT u.first_name, u.last_name, u.email, u.phone, sup.position
         FROM supervisor_profiles sup JOIN users u ON u.id = sup.user_id
        WHERE sup.company_id = $1 AND u.active = true`, [p.company_id])).rows : [];
    res.json({
      company: p ? { id: p.company_id, name: p.name, address: p.address, geofence_radius: p.geofence_radius } : null,
      ojt: p ? { shift_start: p.shift_start, shift_end: p.shift_end, work_days: daysText(p.work_days),
                 required_hours: num(p.required_hours), started_at: p.started_at } : null,
      advisers: advisers.map(a => ({ name: fullName(a), email: a.email, phone: a.phone })),
      supervisors: supervisors.map(a => ({ name: fullName(a), email: a.email, phone: a.phone, position: a.position }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load placement' });
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
    if (g.status === 'MANUAL') flags.push('GPS_MANUAL');
    if (faceFlag(faceRes)) flags.push(faceFlag(faceRes));
    if ((faceRes === 'MATCH' || faceRes === 'LOW') && !live) flags.push('NO_BLINK');

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
                        distance_m: g.distance, face_in: FACE_LABEL[faceRes] } });
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
    if (g.status === 'MANUAL') set.add('GPS_MANUAL');
    if (faceFlag(faceOut)) set.add(faceFlag(faceOut));
    if ((faceOut === 'MATCH' || faceOut === 'LOW') && !liveOut) set.add('NO_BLINK');
    if (netHours < cfg.min_shift_hours) set.add('SHORT_SHIFT');
    if (netHours > cfg.max_shift_hours) set.add('LONG_SHIFT');
    if (late > 0) set.add('LATE');
    if (under > 0) set.add('UNDERTIME');
    if (ot > 0) set.add('OVERTIME');
    const flags = [...set];
    const blocking = flags.filter(f => !INFO_FLAGS.includes(f));

    // ---- approval rules ----
    const risk = blocking.some(f => ['FACE_MISMATCH', 'SHORT_SHIFT', 'LONG_SHIFT'].includes(f)) ? 'HIGH'
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
app.listen(process.env.PORT || 3000, () =>
  console.log('Running on port ' + (process.env.PORT || 3000)));