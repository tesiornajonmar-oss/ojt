/* =====================================================================
   MOCK BACKEND (3/3) — implements every call of js/api-contract.js in the browser.
   DEMO ONLY: it has the same rules your real backend must enforce (scope, approval
   rules, face matching…) so the screens behave realistically, but anyone can edit
   localStorage — a real backend must do all of this on the server.
   To go live: set USE_MOCK:false in js/config.js and delete the js/mock folder.
   ===================================================================== */
(function () {
  const META = {};
  window.API_CONTRACT.forEach(r => { META[r[0]] = { method: r[1], roles: r[3] }; });
  const S = {};                                           // name → function(ctx, args)

  /* ------------------------------------------------------------ basics */
  const DEFAULTS = {
    required_hours: 370, shift_start: '8:00 AM', shift_end: '5:00 PM', work_days: 'Monday – Friday',
    auto_approve: true, face_required: true, face_threshold: 0.5, face_repeat_after: 2, escalate_days: 3,
    min_shift_hours: 0, max_shift_hours: 12, break_min: 60, grace_min: 15, holidays: []
  };
  const R = window.MockRules;
  const HIGH_FLAGS = ['FACE_LOW', 'NO_LIVENESS', 'NO_PHOTO', 'SHORT_SHIFT', 'LONG_SHIFT', 'FACE_REPEAT'];
  const INFO_FLAGS = ['LATE', 'UNDERTIME'];               // shown on the DTR, never block auto-approval
  const nowIso = () => new Date().toISOString();
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const label = u => `${u.title ? u.title + ' ' : ''}${u.first_name} ${u.last_name}`;
  const uidOf = u => u.student_id || u.supervisor_id || u.adviser_id;
  const fail = (m, status) => { const e = new Error(m); e.status = status || 400; throw e; };
  const settingsOf = db => ({ ...DEFAULTS, ...(db.settings || {}) });
  const studentOf = (db, sid) => db.users.find(u => u.role === 'EDUC_INTERN' && u.student_id === sid);
  const ojtOf = (db, sid) => db.ojt_records.find(o => o.student_id === sid);
  const companyOf = (db, id) => db.companies.find(c => c.id === id);
  const adviserOf = (db, aid) => db.users.find(u => u.role === 'ADVISER' && u.adviser_id === aid);
  const supervisorsOf = (db, cid) => db.users.filter(u => u.role === 'SUPERVISOR' && u.company_id === cid);
  const ageDays = s => Math.max(0, Math.floor((Date.now() - new Date(s.time_out || s.time_in || Date.now())) / 864e5));
  const riskOf = flags => { const f = (flags || []).filter(x => !INFO_FLAGS.includes(x)); return !f.length ? 'LOW' : f.some(x => HIGH_FLAGS.includes(x)) ? 'HIGH' : 'MEDIUM'; };
  const tempPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789'; let o = ''; for (let i = 0; i < 9; i++) o += a[Math.floor(Math.random() * a.length)]; return o; };
  const RISK_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  function moaEffective(c) {
    if (c.moa_status === 'APPROVED' && c.moa_expiry && c.moa_expiry < U.dateStr()) return 'EXPIRED';
    return c.moa_status || 'PENDING';
  }
  function log(ctx, action, target, detail) {
    const d = ctx.db;
    d.audit.unshift({ id: MockDB.id('a'), at: nowIso(), actor: ctx.user ? label(ctx.user) : 'System', action, target, detail: detail || '' });
    d.audit = d.audit.slice(0, 1000);
  }
  function notify(db, uids, text, link) {
    const at = nowIso();
    [...new Set(uids)].filter(Boolean).forEach(uid => db.notifications.push({ id: MockDB.id('n'), uid, text, link: link || '', at, read: false }));
    if (db.notifications.length > 3000) db.notifications = db.notifications.slice(-2000);
  }
  const responsibleUids = (db, sid) => {
    const u = studentOf(db, sid), o = ojtOf(db, sid);
    return [u && u.adviser_id, ...(o ? supervisorsOf(db, o.company_id).map(s => s.supervisor_id) : [])].filter(Boolean);
  };

  /* ------------------------------------------------------------ scope (who may see whom) */
  function scopeStudents(ctx) {
    const { db, user } = ctx;
    const all = db.users.filter(u => u.role === 'EDUC_INTERN');
    if (user.role === 'SUPER_ADMIN') return all;
    if (user.role === 'ADVISER') return all.filter(u => u.adviser_id === user.adviser_id);
    if (user.role === 'SUPERVISOR') return all.filter(u => { const o = ojtOf(db, u.student_id); return o && o.company_id === user.company_id; });
    return [];
  }
  const scopeIds = ctx => new Set(scopeStudents(ctx).map(u => u.student_id));
  function assertScope(ctx, sid) {
    if (!scopeIds(ctx).has(sid)) fail('That trainee is not assigned to you.', 403);
  }

  /* ------------------------------------------------------------ summaries */
  function syncStatus(db, sid) {
    const o = ojtOf(db, sid);
    if (!o || o.status === 'ON_HOLD') return;
    const sh = db.shifts.filter(s => s.student_id === sid);
    const ap = sum(sh.filter(s => s.status === 'APPROVED'), s => s.computed_hours);
    o.status = !sh.length ? 'NOT_STARTED' : ap >= (o.target_hours || DEFAULTS.required_hours) ? 'COMPLETED' : 'ACTIVE';
  }

  function summarize(db, sid) {
    const user = studentOf(db, sid);
    if (!user) return null;
    const st = settingsOf(db);
    const o = ojtOf(db, sid) || null;
    const comp = o ? companyOf(db, o.company_id) || null : null;
    const shifts = db.shifts.filter(s => s.student_id === sid);
    const reports = db.reports.filter(r => r.student_id === sid);
    const approved = sum(shifts.filter(s => s.status === 'APPROVED'), s => s.computed_hours);
    const pending = sum(shifts.filter(s => s.status === 'PENDING_VERIFICATION'), s => s.computed_hours);
    const target = (o && o.target_hours) || st.required_hours;
    const pct = Math.min(100, Math.round(approved / target * 100));
    const dates = shifts.map(s => s.date).sort();
    const last = dates.length ? dates[dates.length - 1] : null;
    const status = o && o.status === 'ON_HOLD' ? 'ON_HOLD' : !shifts.length ? 'NOT_STARTED' : approved >= target ? 'COMPLETED' : 'ACTIVE';
    const moa = comp ? moaEffective(comp) : 'PENDING';
    const enrolled = db.face_profiles.some(f => f.student_id === sid);

    const flags = [];
    if (status === 'ACTIVE' && last) { const idle = U.daysBetween(last, U.dateStr()); if (idle >= 5) flags.push(`No activity for ${idle} days`); }
    if (shifts.some(s => s.status === 'PENDING_VERIFICATION' && s.flags.includes('FACE_LOW'))) flags.push('Face mismatch awaiting review');
    if (shifts.some(s => s.status === 'PENDING_VERIFICATION' && s.flags.includes('MANUAL_GPS'))) flags.push('Manual-GPS record awaiting review');
    if (reports.some(r => r.status === 'REVISION')) flags.push('Narrative needs revision');
    if (status !== 'COMPLETED' && moa !== 'APPROVED' && moa !== 'NOT_REQUIRED') flags.push(`Company MOA ${String(moa).toLowerCase()}`);
    if (st.face_required && !enrolled && (status === 'ACTIVE' || status === 'NOT_STARTED')) flags.push('Face ID not set up');

    const advValid = db.users.some(a => a.role === 'ADVISER' && a.adviser_id === user.adviser_id);
    const contractOk = moa === 'APPROVED' || moa === 'NOT_REQUIRED';
    const deployment = !comp ? 'UNASSIGNED' : status === 'ON_HOLD' ? 'ON_HOLD' : status === 'COMPLETED' ? 'COMPLETED' : !contractOk ? 'AWAITING_CONTRACT'
      : (o.start_date && o.start_date > U.dateStr()) ? 'SCHEDULED' : 'DEPLOYED';
    const sc = R.schedFrom(o, st);
    return {
      deployment, supervisors: comp ? supervisorsOf(db, comp.id).map(x => ({ id: x.supervisor_id, name: label(x) })) : [],
      schedule: { days: sc.days, days_label: sc.days_label, start: sc.start_label, end: sc.end_label, break_min: sc.brk, hours: sc.hours },
      sid, user, name: `${user.first_name} ${user.last_name}`, ojt: o ? { ...o, moa_status: moa } : null, company: comp,
      approved, pending, remaining: Math.max(0, target - approved), target, pct, status, last, flags,
      adviserId: advValid ? user.adviser_id : null, face_enrolled: enrolled,
      on_duty: shifts.some(s => s.status === 'TIMED_IN'), today_done: shifts.some(s => s.date === U.dateStr() && s.status !== 'TIMED_IN')
    };
  }

  function decorate(db, s, withPhotos) {
    const u = studentOf(db, s.student_id), c = companyOf(db, s.company_id);
    const out = { ...s, studentName: u ? `${u.first_name} ${u.last_name}` : s.student_id, companyName: c ? c.name : s.company,
      radius: c ? c.geofence_radius : null, risk: riskOf(s.flags || []), age_days: ageDays(s), has_photo_in: !!s.photo_in, has_photo_out: !!s.photo_out };
    if (!withPhotos) { delete out.photo_in; delete out.photo_out; }
    return out;
  }
  const byRiskThenAge = (a, b) => (RISK_RANK[a.risk] - RISK_RANK[b.risk]) || (b.age_days - a.age_days);
  const needsAdviser = (s, st) => s.status === 'PENDING_VERIFICATION' && (s.review_level === 'ADVISER' || (s.review_level === 'SUPERVISOR' && ageDays(s) >= st.escalate_days));

  /* ------------------------------------------------------------ face + attendance rules */
  const euclid = (a, b) => Math.sqrt(a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0));
  const validDescriptor = d => Array.isArray(d) && d.length === 128 && d.every(n => typeof n === 'number' && isFinite(n));
  function checkPhoto(p) {
    if (p == null) return null;
    if (typeof p !== 'string' || !/^data:image\//.test(p) || p.length > 600000) fail('That photo is not valid or is too large.');
    return p;
  }
  function faceCheck(db, sid, face) {
    const st = settingsOf(db);
    if (!face || face.descriptor == null) return { status: 'NONE', score: null, liveness: false };
    if (!validDescriptor(face.descriptor)) fail('Invalid face data.');
    const prof = db.face_profiles.find(f => f.student_id === sid);
    if (!prof) return { status: 'NOT_ENROLLED', score: null, liveness: !!face.liveness };
    const d = Math.min(...prof.descriptors.map(p => euclid(p, face.descriptor)));
    return { status: d <= st.face_threshold ? 'MATCH' : 'LOW', score: +d.toFixed(3), liveness: !!face.liveness };
  }

  // Decides whether a finished shift is auto-approved or which human must look at it.
  function evaluateShift(db, s, schedFlags) {
    const st = settingsOf(db), flags = [];
    if (s.gps_status !== 'In-Range') flags.push('MANUAL_GPS');
    const fs = [s.face_in, s.face_out].filter(Boolean);
    if (fs.some(f => f.status === 'LOW')) flags.push('FACE_LOW');
    else if (st.face_required) {
      if (fs.length < 2 || fs.some(f => f.status === 'NONE')) flags.push('FACE_NONE');
      else if (fs.some(f => f.status === 'NOT_ENROLLED')) flags.push('FACE_NOT_ENROLLED');
    }
    if (fs.some(f => (f.status === 'MATCH' || f.status === 'LOW') && !f.liveness)) flags.push('NO_LIVENESS');
    if (!s.photo_in || !s.photo_out) flags.push('NO_PHOTO');
    if (s.worked_hours < st.min_shift_hours) flags.push('SHORT_SHIFT');
    if (s.worked_hours > st.max_shift_hours) flags.push('LONG_SHIFT');
    // same person failing the face check on consecutive shifts = possible proxy attendance
    const need = Math.max(2, +st.face_repeat_after || 2);
    if (fs.some(f => f.status === 'LOW')) {
      const prev = db.shifts.filter(x => x.student_id === s.student_id && x.id !== s.id && x.status !== 'TIMED_IN').sort((x, y) => (y.time_in || '').localeCompare(x.time_in || '')).slice(0, need - 1);
      if (prev.length === need - 1 && prev.every(x => [x.face_in, x.face_out].some(f => f && f.status === 'LOW'))) flags.push('FACE_REPEAT');
    }
    (schedFlags || []).forEach(f => flags.push(f));
    s.flags = flags;

    if (st.auto_approve && !flags.filter(f => !INFO_FLAGS.includes(f)).length) {
      s.status = 'APPROVED'; s.approval_method = 'AUTO'; s.verified_by = 'Auto-verified'; s.verified_at = nowIso(); s.review_level = null;
      return 'AUTO_APPROVED';
    }
    s.status = 'PENDING_VERIFICATION';
    s.review_level = supervisorsOf(db, s.company_id).length ? 'SUPERVISOR' : 'ADVISER';
    return s.review_level === 'SUPERVISOR' ? 'PENDING_SUPERVISOR' : 'PENDING_ADVISER';
  }

  /* ------------------------------------------------------------ auth */
  const PORTAL_ROLES = { student: ['EDUC_INTERN'], faculty: ['ADVISER', 'SUPER_ADMIN'], supervisor: ['SUPERVISOR'], superadmin: ['SUPER_ADMIN'] };
  const PORTAL_HOME = { EDUC_INTERN: 'the Student portal (login.html)', ADVISER: 'the Faculty portal (admin/login.html)', SUPERVISOR: 'the Company Supervisor portal (supervisor/login.html)', SUPER_ADMIN: 'the Super Admin portal (superadmin/login.html)' };

  S['auth.login'] = (ctx, a) => {
    const u = ctx.db.users.find(x => x.username.toLowerCase() === String(a.username || '').toLowerCase() && x.password === a.password);
    if (!u) fail('Invalid username or password.', 401);
    if (u.active === false) fail('This account has been disabled. Please contact the OJT office.', 403);
    if (!(PORTAL_ROLES[a.portal] || []).includes(u.role)) fail(`This account signs in at ${PORTAL_HOME[u.role]}.`, 403);
    const token = btoa(JSON.stringify({ sub: uidOf(u), role: u.role, iat: Date.now() }));   // demo token — NOT secure
    return { token, user: { username: u.username, role: u.role, id: uidOf(u), name: label(u) } };
  };
  S['auth.logout'] = () => ({ ok: true });
  S['auth.me'] = ctx => {
    const u = ctx.user, out = { ...u, id: uidOf(u), name: label(u), badges: badgesOf(ctx) };
    if (u.role === 'SUPERVISOR') { const c = companyOf(ctx.db, u.company_id); out.company_name = c ? c.name : ''; }
    return out;
  };
  S['auth.changePassword'] = (ctx, a) => {
    if (ctx.user.password !== a.old_password) fail('Current password is incorrect.');
    if (String(a.new_password || '').length < 6) fail('New password must be at least 6 characters.');
    ctx.user.password = a.new_password; ctx.user.must_change = false;
    log(ctx, 'Changed own password', label(ctx.user), '');
    return { ok: true };
  };
  S['auth.updateProfile'] = (ctx, a) => {
    const email = String(a.email == null ? ctx.user.email || '' : a.email).trim(), phone = String(a.phone == null ? ctx.user.phone || '' : a.phone).trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Please enter a valid email address.');
    ctx.user.email = email; ctx.user.phone = phone;
    return { ok: true };
  };
  // Public: never reveals whether the account exists. Staff who can reset the password are notified.
  S['auth.forgotPassword'] = (ctx, a) => {
    const db = ctx.db, uname = String(a.username || '').trim().toLowerCase();
    if (!uname) fail('Please enter your username.');
    const u = db.users.find(x => x.username.toLowerCase() === uname && (PORTAL_ROLES[a.portal] || []).includes(x.role));
    const admins = db.users.filter(x => x.role === 'SUPER_ADMIN').map(uidOf);
    let who = 'the system administrator';
    if (u) {
      const name = label(u);
      if (u.role === 'EDUC_INTERN') { notify(db, [u.adviser_id, ...admins], `🔑 ${name} (${u.student_id}) asked for a password reset.`, 'students.html'); }
      else if (u.role === 'SUPERVISOR') { notify(db, admins, `🔑 Company supervisor ${name} asked for a password reset.`, 'supervisors.html'); }
      else if (u.role === 'ADVISER') { notify(db, admins, `🔑 Faculty ${name} asked for a password reset.`, 'advisers.html'); }
      db.audit.unshift({ id: MockDB.id('a'), at: nowIso(), actor: 'System', action: 'Password reset requested', target: name, detail: a.portal });
    }
    if (a.portal === 'student') who = 'your faculty adviser and the system administrator';
    return { ok: true, message: `If that username exists, a password-reset request was sent to ${who}. They will give you a new password.` };
  };
  S['auth.setTheme'] = (ctx, a) => { ctx.user.theme = a.theme === 'dark' ? 'dark' : 'light'; return { ok: true }; };

  function badgesOf(ctx) {
    const { db, user } = ctx, st = settingsOf(db), b = { approvals: 0, messages: unreadThreads(ctx) };
    if (user.role === 'SUPERVISOR') {
      const ids = scopeIds(ctx);
      b.approvals = db.shifts.filter(s => s.status === 'PENDING_VERIFICATION' && s.review_level === 'SUPERVISOR' && ids.has(s.student_id)).length;
    } else if (user.role === 'ADVISER' || (user.role === 'SUPER_ADMIN' && ctx.portal === 'faculty')) {
      const ids = scopeIds(ctx);
      b.approvals = db.shifts.filter(s => ids.has(s.student_id) && needsAdviser(s, st)).length + db.reports.filter(r => r.status === 'PENDING' && ids.has(r.student_id)).length;
    }
    return b;
  }

  /* ------------------------------------------------------------ notifications */
  S['notifications.list'] = ctx => {
    const mine = ctx.db.notifications.filter(n => n.uid === uidOf(ctx.user)).sort((a, b) => b.at.localeCompare(a.at));
    return { items: mine.slice(0, 30), unread: mine.filter(n => !n.read).length };
  };
  S['notifications.markRead'] = (ctx, a) => {
    ctx.db.notifications.forEach(n => { if (n.uid === uidOf(ctx.user) && (!a.id || n.id === a.id)) n.read = true; });
    return { ok: true };
  };

  /* ------------------------------------------------------------ messages
     A conversation is between people (faculty <-> company supervisor). It may optionally be ABOUT one trainee. */
  const userByUid = (db, uid) => db.users.find(u => u.role !== 'EDUC_INTERN' && uidOf(u) === uid);
  const partsOf = (db, t) => t.participants || responsibleUids(db, t.student_id);
  const visibleThreads = ctx => ctx.user.role === 'SUPER_ADMIN' ? ctx.db.threads : ctx.db.threads.filter(t => partsOf(ctx.db, t).includes(uidOf(ctx.user)));
  const isUnread = (t, uid, msgs) => {
    const last = msgs.filter(m => m.thread_id === t.id).sort((a, b) => b.at.localeCompare(a.at))[0];
    return !!last && last.sender !== uid && (!t.reads[uid] || t.reads[uid] < last.at);
  };
  function unreadThreads(ctx) {
    if (!ctx.user || !['ADVISER', 'SUPER_ADMIN', 'SUPERVISOR'].includes(ctx.user.role)) return 0;
    const uid = uidOf(ctx.user);
    return visibleThreads(ctx).filter(t => isUnread(t, uid, ctx.db.messages)).length;
  }
  function threadView(ctx, t) {
    const db = ctx.db, me = uidOf(ctx.user), u = t.student_id ? studentOf(db, t.student_id) : null, o = t.student_id ? ojtOf(db, t.student_id) : null, c = o ? companyOf(db, o.company_id) : null;
    const msgs = db.messages.filter(m => m.thread_id === t.id).sort((a, b) => a.at.localeCompare(b.at));
    const last = msgs[msgs.length - 1];
    const others = partsOf(db, t).filter(x => x !== me).map(x => userByUid(db, x)).filter(Boolean);
    return { id: t.id, student_id: t.student_id || null, student_name: u ? `${u.first_name} ${u.last_name}` : '', company: c ? c.name : '',
      with: others.map(x => label(x)), with_roles: others.map(x => x.role),
      subject: t.subject, last_at: t.last_at, last_snippet: last ? last.body.slice(0, 90) : '', last_sender: last ? last.sender_name : '',
      unread: isUnread(t, me, db.messages) };
  }
  // People the caller may start a conversation with (faculty <-> company supervisors).
  function contactsOf(ctx) {
    const { db, user } = ctx, me = uidOf(user);
    const orgOf = x => x.role === 'SUPERVISOR' ? ((companyOf(db, x.company_id) || {}).name || '') : (x.department || 'Faculty');
    let list;
    if (user.role === 'SUPER_ADMIN') list = db.users.filter(x => x.role === 'ADVISER' || x.role === 'SUPERVISOR');
    else if (user.role === 'ADVISER') {
      const cids = new Set(scopeStudents(ctx).map(u => (ojtOf(db, u.student_id) || {}).company_id).filter(Boolean));
      list = db.users.filter(x => x.role === 'SUPERVISOR' && cids.has(x.company_id));
    } else {
      const aids = new Set(scopeStudents(ctx).map(u => u.adviser_id).filter(Boolean));
      list = db.users.filter(x => x.role === 'ADVISER' && aids.has(x.adviser_id));
    }
    return list.filter(x => uidOf(x) !== me).map(x => ({ uid: uidOf(x), name: label(x), role: x.role, org: orgOf(x) }))
      .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  }
  S['messages.contacts'] = ctx => contactsOf(ctx);
  S['messages.trainees'] = ctx => scopeStudents(ctx).map(u => { const o = ojtOf(ctx.db, u.student_id), c = o && companyOf(ctx.db, o.company_id); return { sid: u.student_id, name: `${u.first_name} ${u.last_name}`, company: c ? c.name : '', section: u.section || '' }; })
    .sort((a, b) => a.name.localeCompare(b.name));
  S['messages.threads'] = ctx => visibleThreads(ctx).sort((a, b) => b.last_at.localeCompare(a.last_at)).map(t => threadView(ctx, t));
  S['messages.get'] = (ctx, a) => {
    const t = visibleThreads(ctx).find(x => x.id === a.id);
    if (!t) fail('Conversation not found.', 404);
    t.reads[uidOf(ctx.user)] = nowIso();
    return { thread: threadView(ctx, t), messages: ctx.db.messages.filter(m => m.thread_id === t.id).sort((x, y) => x.at.localeCompare(y.at)),
      me: uidOf(ctx.user) };
  };
  function addMessage(ctx, t, body) {
    const db = ctx.db, text = String(body || '').trim();
    if (!text) fail('Please write a message.');
    if (text.length > 2000) fail('Message is too long (2000 characters max).');
    const u = ctx.user, at = nowIso();
    db.messages.push({ id: MockDB.id('m'), thread_id: t.id, sender: uidOf(u), sender_name: label(u), sender_role: u.role, at, body: text });
    t.last_at = at; t.reads[uidOf(u)] = at;
    const stu = t.student_id ? studentOf(db, t.student_id) : null;
    notify(db, partsOf(db, t).filter(x => x !== uidOf(u)), `${label(u)} sent you a message${stu ? ' about ' + stu.first_name + ' ' + stu.last_name : ''}: ${t.subject}`, 'messages.html?thread=' + t.id);
  }
  S['messages.start'] = (ctx, a) => {
    const subject = String(a.subject || '').trim();
    if (!subject) fail('Please add a subject.');
    if (!a.to && !a.student_id) fail('Choose who to message.');
    const me = uidOf(ctx.user);
    let parts = [me];
    if (a.to) {
      if (!contactsOf(ctx).some(c => c.uid === a.to)) fail('You cannot message that person.', 403);
      parts.push(a.to);
    }
    if (a.student_id) { assertScope(ctx, a.student_id); if (!a.to) parts = parts.concat(responsibleUids(ctx.db, a.student_id)); }
    const t = { id: MockDB.id('t'), student_id: a.student_id || null, participants: [...new Set(parts)], subject: subject.slice(0, 120), created_by: me, created_at: nowIso(), last_at: nowIso(), reads: {} };
    ctx.db.threads.push(t);
    addMessage(ctx, t, a.body);
    return { id: t.id };
  };
  S['messages.send'] = (ctx, a) => {
    const t = visibleThreads(ctx).find(x => x.id === a.id);
    if (!t) fail('Conversation not found.', 404);
    addMessage(ctx, t, a.body);
    return { ok: true };
  };

  /* ------------------------------------------------------------ student */
  const myShifts = ctx => ctx.db.shifts.filter(s => s.student_id === ctx.user.student_id)
    .sort((a, b) => (b.date + (b.time_in || '')).localeCompare(a.date + (a.time_in || '')));
  const lite = s => { const { photo_in, photo_out, ...rest } = s; return { ...rest, has_photo_in: !!photo_in, has_photo_out: !!photo_out }; };

  S['student.dashboard'] = ctx => {
    const { db, user } = ctx, sm = summarize(db, user.student_id), st = settingsOf(db), today = U.dateStr();
    const shifts = myShifts(ctx), active = shifts.find(s => s.status === 'TIMED_IN') || null;
    const doneToday = shifts.find(s => s.date === today && s.status !== 'TIMED_IN') || null;
    const feed = [];
    shifts.filter(s => s.status !== 'TIMED_IN').forEach(s => feed.push({ at: s.time_out || s.time_in, label: `Attendance — ${U.fmtShortDate(s.date)} (${s.computed_hours || 0} h)`, status: s.status }));
    db.reports.filter(r => r.student_id === user.student_id && r.status !== 'DRAFT').forEach(r =>
      feed.push({ at: r.submitted_at || r.date, label: `Narrative — ${r.title}`, status: r.status === 'PENDING' ? 'PENDING_VERIFICATION' : r.status }));
    feed.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return {
      user: { first_name: user.first_name, last_name: user.last_name, student_id: user.student_id },
      hours: { total: sm.approved, target: sm.target, pct: sm.pct, remaining: sm.remaining, pending: sm.pending },
      active: active && lite(active), today: doneToday && lite(doneToday), feed: feed.slice(0, 5),
      announcements: db.announcements.filter(a => a.active && (!a.expires || a.expires >= today) && (a.audience === 'ALL' || a.audience === user.adviser_id))
        .sort((a, b) => (b.created || '').localeCompare(a.created || '')),
      face: { enrolled: sm.face_enrolled }, policy: { face_required: st.face_required }, status: sm.status
    };
  };

  S['student.placement'] = ctx => {
    const { db, user } = ctx, sm = summarize(db, user.student_id), o = sm.ojt, c = sm.company;
    return {
      user: { first_name: user.first_name, last_name: user.last_name, student_id: user.student_id, program: user.program, email: user.email },
      ojt: o, company: c && { ...c, moa_effective: moaEffective(c) }, status: sm.status, hours: { total: sm.approved, target: sm.target },
      advisers: db.users.filter(a => a.role === 'ADVISER' && a.adviser_id === user.adviser_id).map(a => ({ name: label(a), email: a.email, department: a.department })),
      supervisors: c ? supervisorsOf(db, c.id).map(s => ({ name: label(s), email: s.email, phone: s.phone, position: s.position })) : [],
      face_required: settingsOf(db).face_required, deployment: sm.deployment, schedule: sm.schedule,
      schedule_request: db.schedule_requests.filter(r => r.student_id === user.student_id).sort((a, b) => b.at.localeCompare(a.at))[0] || null,
      placements: db.placements.filter(p => p.student_id === user.student_id).sort((a, b) => b.start_date.localeCompare(a.start_date)).map(p => ({ ...p, company: (companyOf(db, p.company_id) || {}).name || '' }))
    };
  };
  S['student.shifts'] = ctx => myShifts(ctx).map(lite);

  S['student.clockIn'] = (ctx, a) => {
    const { db, user } = ctx, o = ojtOf(db, user.student_id);
    if (!o) fail('No OJT record found for your account.');
    if (o.status === 'ON_HOLD') fail('Your OJT is on hold. Please contact your adviser.');
    const shifts = myShifts(ctx);
    if (shifts.some(s => s.status === 'TIMED_IN')) fail('You are already clocked in.');
    if (shifts.some(s => s.date === U.dateStr())) fail("Today's shift is already submitted.");
    const comp = companyOf(db, o.company_id);
    let gps = 'Manual', dist = null, lat = null, lng = null;
    const c = a.coords;
    if (c && typeof c.lat === 'number' && typeof c.lng === 'number' && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180) {
      lat = c.lat; lng = c.lng;
      if (comp && comp.lat != null && comp.lng != null) {
        dist = Math.round(U.haversine(lat, lng, comp.lat, comp.lng));
        gps = dist <= (comp.geofence_radius || 300) ? 'In-Range' : 'Manual';
      }
    }
    const shift = { id: MockDB.id('s'), student_id: user.student_id, company_id: o.company_id, company: comp ? comp.name : '—', date: U.dateStr(),
      time_in: nowIso(), time_out: null, computed_hours: 0, status: 'TIMED_IN', gps_status: gps, distance_m: dist, lat, lng,
      photo_in: checkPhoto(a.photo), photo_out: null, face_in: faceCheck(db, user.student_id, a.face), face_out: null, flags: [], review_level: null,
      approval_method: null, verified_by: null, verified_at: null, note: '' };
    db.shifts.push(shift);
    return { shift: lite(shift) };
  };

  S['student.clockOut'] = (ctx, a) => {
    const { db, user } = ctx;
    const s = db.shifts.find(x => x.student_id === user.student_id && x.status === 'TIMED_IN');
    if (!s) fail('You are not clocked in.');
    s.time_out = nowIso();
    s.photo_out = checkPhoto(a.photo);
    s.face_out = faceCheck(db, user.student_id, a.face);
    const c = a.coords, comp = companyOf(db, s.company_id);
    if (c && typeof c.lat === 'number' && typeof c.lng === 'number' && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180) {
      s.lat_out = c.lat; s.lng_out = c.lng;
      if (comp && comp.lat != null) s.distance_out = Math.round(U.haversine(c.lat, c.lng, comp.lat, comp.lng));
    }
    const schedFlags = R.computeShift(s, R.schedFrom(ojtOf(db, user.student_id), settingsOf(db)));   // regular / late / undertime / overtime
    const outcome = evaluateShift(db, s, schedFlags);
    syncStatus(db, user.student_id);
    const stu = `${user.first_name} ${user.last_name}`;
    if (outcome === 'AUTO_APPROVED') notify(db, [user.student_id], `Your shift on ${U.fmtShortDate(s.date)} was verified automatically (${s.computed_hours} h).`, 'dtr.html');
    else {
      const why = s.flags.filter(f => !INFO_FLAGS.includes(f)).map(f => FLAG_LABEL[f] || f).join('; ');
      if (outcome === 'PENDING_SUPERVISOR') notify(db, supervisorsOf(db, s.company_id).map(x => x.supervisor_id), `${stu} submitted a shift that needs your review (${why}).`, 'approvals.html');
      else notify(db, [user.adviser_id], `${stu} submitted a shift that needs your review (${why}).`, 'approvals.html');
    }
    if (s.flags.includes('FACE_REPEAT')) {
      notify(db, [user.adviser_id, ...supervisorsOf(db, s.company_id).map(x => x.supervisor_id)], `⚠ Security: ${stu}'s face did not match on several shifts in a row (possible proxy attendance).`, 'approvals.html');
      log(ctx, 'Security alert: repeated face mismatch', stu, user.student_id);
    }
    return { shift: lite(s), outcome, flags: s.flags };
  };

  S['student.reports'] = ctx => ctx.db.reports.filter(r => r.student_id === ctx.user.student_id).sort((a, b) => b.date.localeCompare(a.date)).map(r => repView(ctx.db, r));
  S['student.saveReport'] = (ctx, a) => {
    const { db, user } = ctx;
    const title = String(a.title || '').trim(), body = String(a.body || '').trim();
    if (!title) fail('Please add a title.');
    const files = Array.isArray(a.attachments) ? a.attachments : (r0 => r0 ? r0.attachments || [] : [])(a.id ? db.reports.find(x => x.id === a.id && x.student_id === user.student_id) : null);
    if (files.length > 3) fail('You can attach up to 3 files.');
    files.forEach(f => { if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(String(f.data || ''))) fail('Attachments must be a JPG, PNG or PDF file.'); });
    if (a.submit && body.length < 50 && !files.length) fail('Please write at least a short paragraph (50+ characters) or attach a scan/photo of your written report.');
    let r = a.id ? db.reports.find(x => x.id === a.id && x.student_id === user.student_id) : null;
    if (r && !['DRAFT', 'REVISION'].includes(r.status)) fail('This report can no longer be edited.');
    if (!r) { r = { id: MockDB.id('r'), student_id: user.student_id, feedback: '', submitted_at: null, status: 'DRAFT' }; db.reports.push(r); }
    const mine = new Set(db.accomplishments.filter(x => x.student_id === user.student_id).map(x => x.id));
    Object.assign(r, { accomplishment_ids: (Array.isArray(a.accomplishment_ids) ? a.accomplishment_ids : []).filter(id => mine.has(id)), title, body, date: a.date || U.dateStr(), attachments: files.map(f => ({ name: String(f.name || 'file').slice(0, 80), type: f.type, data: f.data })) });
    if (a.submit) {
      r.status = 'PENDING'; r.submitted_at = nowIso();
      notify(db, [user.adviser_id], `${user.first_name} ${user.last_name} submitted a narrative report: ${title}.`, 'approvals.html');
    }
    return repView(db, r);
  };
  S['student.deleteReport'] = (ctx, a) => {
    const r = ctx.db.reports.find(x => x.id === a.id && x.student_id === ctx.user.student_id);
    if (!r || r.status !== 'DRAFT') fail('Only drafts can be deleted.');
    ctx.db.reports = ctx.db.reports.filter(x => x !== r);
    return { ok: true };
  };

  S['student.faceStatus'] = ctx => {
    const p = ctx.db.face_profiles.find(f => f.student_id === ctx.user.student_id);
    return { enrolled: !!p, enrolled_at: p ? p.enrolled_at : null, shots: p ? p.descriptors.length : 0, face_required: settingsOf(ctx.db).face_required };
  };
  S['student.enrollFace'] = (ctx, a) => {
    if (a.consent !== true) fail('You must agree to the Face ID consent first.');
    const ds = a.descriptors;
    if (!Array.isArray(ds) || ds.length < 1 || ds.length > 5 || !ds.every(validDescriptor)) fail('Invalid face data. Please try again.');
    const db = ctx.db, sid = ctx.user.student_id;
    if (db.face_profiles.some(f => f.student_id === sid)) fail('Your Face ID is already set up. To change it, ask your adviser to reset it.');
    db.face_profiles.push({ student_id: sid, descriptors: ds, photo: checkPhoto(a.photo), enrolled_at: nowIso(), consent_at: nowIso() });
    log(ctx, 'Enrolled Face ID', label(ctx.user), sid);
    return { enrolled: true };
  };

  /* ------------------------------------------------------------ approvals (shared by supervisor + faculty) */
  function loadPending(ctx, id) {
    const s = ctx.db.shifts.find(x => x.id === id);
    if (!s) fail('Attendance record not found.', 404);
    assertScope(ctx, s.student_id);
    if (s.status !== 'PENDING_VERIFICATION') fail('This record is no longer waiting for review.');
    if (ctx.user.role === 'SUPERVISOR' && s.review_level !== 'SUPERVISOR') fail('This item was escalated to the faculty adviser.');
    return s;
  }
  const methodOf = ctx => ctx.user.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'ADVISER';
  function approveCore(ctx, id, hours, countOt) {
    const s = loadPending(ctx, id), db = ctx.db;
    const h = hours == null || hours === '' ? s.computed_hours + (countOt && s.ot_hours > 0 ? s.ot_hours : 0) : +hours;
    if (!(h >= 0 && h <= 24)) fail('Hours must be between 0 and 24.');
    if (s.ot_hours > 0) s.ot_status = h > (s.regular_hours || 0) + 0.001 ? 'APPROVED' : 'DECLINED';
    s.computed_hours = +h.toFixed(2); s.status = 'APPROVED'; s.approval_method = methodOf(ctx);
    s.verified_by = label(ctx.user); s.verified_at = nowIso(); s.review_level = null;
    syncStatus(db, s.student_id);
    const u = studentOf(db, s.student_id);
    notify(db, [s.student_id], `Your attendance on ${U.fmtShortDate(s.date)} was approved by ${label(ctx.user)} (${s.computed_hours} h${s.ot_status === 'APPROVED' ? ', overtime included' : s.ot_status === 'DECLINED' ? ', overtime not counted' : ''}).`, 'dtr.html');
    log(ctx, 'Approved attendance', `${u.first_name} ${u.last_name}`, `${U.fmtShortDate(s.date)} • ${s.computed_hours} h`);
    return { ok: true };
  }
  function rejectCore(ctx, id, note) {
    const s = loadPending(ctx, id), db = ctx.db;
    s.status = 'REJECTED'; s.note = String(note || ''); s.verified_by = label(ctx.user); s.verified_at = nowIso(); s.approval_method = methodOf(ctx); s.review_level = null;
    syncStatus(db, s.student_id);
    const u = studentOf(db, s.student_id);
    notify(db, [s.student_id], `Your attendance on ${U.fmtShortDate(s.date)} was rejected${s.note ? ': ' + s.note : '.'}`, 'dtr.html');
    log(ctx, 'Rejected attendance', `${u.first_name} ${u.last_name}`, `${U.fmtShortDate(s.date)}${s.note ? ' • ' + s.note : ''}`);
    return { ok: true };
  }
  function bulkCore(ctx, ids) {
    let approved = 0, skipped = 0;
    (Array.isArray(ids) ? ids : []).forEach(id => {
      const s = ctx.db.shifts.find(x => x.id === id);
      if (!s || s.status !== 'PENDING_VERIFICATION' || riskOf(s.flags) === 'HIGH') { skipped++; return; }
      try { approveCore(ctx, id, null, false); approved++; } catch (e) { skipped++; }
    });
    if (approved) log(ctx, 'Bulk approved attendance', `${approved} record(s)`, 'High-risk records are never bulk-approved');
    return { approved, skipped };
  }

  /* ------------------------------------------------------------ supervisor */
  const supPending = ctx => { const ids = scopeIds(ctx); return ctx.db.shifts.filter(s => s.status === 'PENDING_VERIFICATION' && s.review_level === 'SUPERVISOR' && ids.has(s.student_id)); };

  // Today's attendance board: who is in, who is done, who has not clocked in yet.
  function supBoard(ctx, roster) {
    const today = U.dateStr(), dow = new Date().getDay();
    return roster.filter(r => r.status === 'ACTIVE' || r.status === 'NOT_STARTED').map(r => {
      const sh = ctx.db.shifts.filter(s => s.student_id === r.sid && s.date === today).sort((a, b) => (a.time_in || '').localeCompare(b.time_in || ''))[0];
      const start = r.ojt && r.ojt.shift_start, startMin = start ? (() => { const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(start); return m ? ((+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + +m[2] : 480; })() : 480;
      const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
      let state = 'NOT_IN';
      if (sh) state = sh.status === 'TIMED_IN' ? 'ON_DUTY' : 'DONE';
      else if (dow === 0 || dow === 6) state = 'OFF';
      else if (nowMin < startMin + 15) state = 'EXPECTED';
      let late = false;
      if (sh && sh.time_in) { const t = new Date(sh.time_in); late = t.getHours() * 60 + t.getMinutes() > startMin + 15; }
      return { sid: r.sid, name: r.name, section: r.user.section || '', state, time_in: sh ? sh.time_in : null, time_out: sh && sh.status !== 'TIMED_IN' ? sh.time_out : null, late };
    }).sort((a, b) => ['NOT_IN', 'ON_DUTY', 'EXPECTED', 'DONE', 'OFF'].indexOf(a.state) - ['NOT_IN', 'ON_DUTY', 'EXPECTED', 'DONE', 'OFF'].indexOf(b.state));
  }
  // Hours of the company's trainees for the last 7 days.
  function supWeek(ctx) {
    const ids = scopeIds(ctx), out = [];
    for (let i = 6; i >= 0; i--) {
      const ds = U.addDays(U.dateStr(), -i);
      const hrs = sum(ctx.db.shifts.filter(s => ids.has(s.student_id) && s.date === ds && s.status !== 'REJECTED' && s.status !== 'TIMED_IN'), s => s.computed_hours);
      out.push({ date: ds, hours: +hrs.toFixed(1) });
    }
    return out;
  }
  // Trainees who are at least 75% done (or finished) and have no submitted evaluation yet.
  function supEvalDue(ctx, roster) {
    return roster.filter(r => (r.pct >= 75 || r.status === 'COMPLETED') && !ctx.db.evaluations.some(e => e.student_id === r.sid && e.status === 'SUBMITTED'))
      .map(r => ({ sid: r.sid, name: r.name, pct: r.pct }));
  }
  S['supervisor.dashboard'] = ctx => {
    const { db, user } = ctx, roster = scopeStudents(ctx).map(u => summarize(db, u.student_id)), pend = supPending(ctx), st = settingsOf(db);
    const comp = companyOf(db, user.company_id);
    return {
      company: comp ? { ...comp, moa_effective: moaEffective(comp) } : null,
      counts: { trainees: roster.length, pending: pend.length, on_duty: roster.filter(r => r.on_duty).length,
        overtime: pend.filter(s => s.ot_hours > 0 && s.ot_status !== 'APPROVED').length, flagged: roster.filter(r => r.flags.length).length, avg: roster.length ? Math.round(roster.reduce((a, r) => a + r.pct, 0) / roster.length) : 0 },
      onDuty: roster.filter(r => r.on_duty).map(r => ({ sid: r.sid, name: r.name })),
      oldest: pend.map(s => decorate(db, s, false)).sort(byRiskThenAge).slice(0, 5),
      attention: roster.filter(r => r.flags.length).slice(0, 6).map(r => ({ sid: r.sid, name: r.name, flags: r.flags })),
      board: supBoard(ctx, roster), week: supWeek(ctx), evalDue: supEvalDue(ctx, roster),
      escalate_days: st.escalate_days
    };
  };
  S['supervisor.trainees'] = ctx => scopeStudents(ctx).map(u => summarize(ctx.db, u.student_id));
  function traineeBundle(ctx, sid) {
    assertScope(ctx, sid);
    const db = ctx.db, o = ojtOf(db, sid), prof = db.face_profiles.find(f => f.student_id === sid);
    return {
      summary: summarize(db, sid),
      shifts: db.shifts.filter(s => s.student_id === sid).sort((x, y) => (y.date + (y.time_in || '')).localeCompare(x.date + (x.time_in || ''))).slice(0, 60).map(s => decorate(db, s, false)),
      reports: db.reports.filter(r => r.student_id === sid && r.status !== 'DRAFT').sort((x, y) => y.date.localeCompare(x.date)).map(r => repView(db, r)),
      accomplishments: db.accomplishments.filter(x => x.student_id === sid).sort((x, y) => y.date.localeCompare(x.date)),
      evaluation: db.evaluations.find(e => e.student_id === sid) || null,
      face: { enrolled: !!prof, enrolled_at: prof ? prof.enrolled_at : null },
      supervisors: o ? supervisorsOf(db, o.company_id).map(x => ({ name: label(x), email: x.email, phone: x.phone })) : [],
      placements: db.placements.filter(p => p.student_id === sid).sort((a, b) => b.start_date.localeCompare(a.start_date)).map(p => ({ ...p, company: (companyOf(db, p.company_id) || {}).name || '' })),
      schedule_request: db.schedule_requests.filter(r => r.student_id === sid && r.status === 'PENDING')[0] || null
    };
  }
  S['supervisor.trainee'] = (ctx, a) => traineeBundle(ctx, a.sid);
  S['supervisor.queue'] = ctx => {
    const db = ctx.db, pend = supPending(ctx).map(s => decorate(db, s, true)).sort(byRiskThenAge);
    return { pending: pend.slice(0, 100), total: pend.length };
  };
  S['supervisor.approveShift'] = (ctx, a) => approveCore(ctx, a.id, a.hours, !!a.count_ot);
  S['supervisor.rejectShift'] = (ctx, a) => rejectCore(ctx, a.id, a.note);
  S['supervisor.bulkApprove'] = (ctx, a) => bulkCore(ctx, a.ids);
  S['supervisor.escalateShift'] = (ctx, a) => {
    const s = loadPending(ctx, a.id), db = ctx.db, u = studentOf(db, s.student_id);
    s.review_level = 'ADVISER'; s.note = String(a.note || '');
    notify(db, [u.adviser_id], `${label(ctx.user)} escalated ${u.first_name} ${u.last_name}'s attendance on ${U.fmtShortDate(s.date)} to you${s.note ? ': ' + s.note : '.'}`, 'approvals.html');
    log(ctx, 'Escalated attendance to adviser', `${u.first_name} ${u.last_name}`, U.fmtShortDate(s.date));
    return { ok: true };
  };
  S['supervisor.evaluations'] = ctx => scopeStudents(ctx).map(u => {
    const sm = summarize(ctx.db, u.student_id);
    return { sid: sm.sid, name: sm.name, program: u.program, approved: sm.approved, target: sm.target, pct: sm.pct, status: sm.status,
      evaluation: ctx.db.evaluations.find(e => e.student_id === u.student_id) || null };
  });
  const EVAL_KEYS = ['attendance', 'quality', 'initiative', 'teamwork', 'communication', 'technical', 'professionalism'];
  S['supervisor.saveEvaluation'] = (ctx, a) => {
    assertScope(ctx, a.sid);
    const db = ctx.db, r = a.ratings || {};
    EVAL_KEYS.forEach(k => { if (r[k] != null && !(Number.isInteger(+r[k]) && +r[k] >= 1 && +r[k] <= 5)) fail('Ratings must be from 1 to 5.'); });
    if (a.submit) {
      if (!EVAL_KEYS.every(k => r[k])) fail('Please rate every criterion before submitting.');
      if (!['YES', 'NO'].includes(a.recommend)) fail('Please choose whether you recommend this trainee.');
    }
    let ev = db.evaluations.find(e => e.student_id === a.sid);
    if (!ev) { ev = { id: MockDB.id('ev'), student_id: a.sid, supervisor_id: ctx.user.supervisor_id, company_id: ctx.user.company_id }; db.evaluations.push(ev); }
    ev.supervisor_id = ctx.user.supervisor_id; ev.supervisor_name = label(ctx.user);
    ev.ratings = {}; EVAL_KEYS.forEach(k => { if (r[k]) ev.ratings[k] = +r[k]; });
    ev.comments = String(a.comments || '').slice(0, 2000); ev.recommend = a.recommend || null; ev.updated_at = nowIso();
    ev.status = a.submit ? 'SUBMITTED' : (ev.status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT');
    if (a.submit) {
      ev.submitted_at = nowIso();
      const u = studentOf(db, a.sid);
      notify(db, [u.adviser_id], `${label(ctx.user)} submitted the OJT evaluation of ${u.first_name} ${u.last_name}.`, 'students.html?sid=' + a.sid);
      log(ctx, 'Submitted evaluation', `${u.first_name} ${u.last_name}`, a.recommend === 'YES' ? 'Recommended' : 'Not recommended');
    }
    return ev;
  };

  /* ------------------------------------------------------------ faculty */
  S['faculty.roster'] = ctx => scopeStudents(ctx).map(u => summarize(ctx.db, u.student_id));
  S['faculty.trainee'] = (ctx, a) => traineeBundle(ctx, a.sid);
  S['faculty.queue'] = ctx => {
    const db = ctx.db, ids = scopeIds(ctx), st = settingsOf(db);
    const pend = db.shifts.filter(s => s.status === 'PENDING_VERIFICATION' && ids.has(s.student_id));
    const mine = pend.filter(s => needsAdviser(s, st)).map(s => decorate(db, s, true)).sort(byRiskThenAge);
    const wait = pend.filter(s => !needsAdviser(s, st)).map(s => decorate(db, s, true)).sort(byRiskThenAge);
    const reports = db.reports.filter(r => r.status === 'PENDING' && ids.has(r.student_id))
      .sort((a, b) => (a.submitted_at || a.date).localeCompare(b.submitted_at || b.date)).map(r => { const u = studentOf(db, r.student_id); return { ...r, studentName: `${u.first_name} ${u.last_name}` }; });
    return { needsYou: mine.slice(0, 100), awaitingSupervisor: wait.slice(0, 100), reports, total: mine.length + reports.length, escalate_days: st.escalate_days };
  };
  S['faculty.dashboard'] = ctx => {
    const q = S['faculty.queue'](ctx), roster = S['faculty.roster'](ctx);
    return { roster, needsYou: q.needsYou.slice(0, 6), awaiting: q.awaitingSupervisor.length, reports: q.reports.slice(0, 6),
      counts: { needsYou: q.needsYou.length, reports: q.reports.length, awaiting: q.awaitingSupervisor.length } };
  };
  S['faculty.approveShift'] = (ctx, a) => approveCore(ctx, a.id, a.hours, !!a.count_ot);
  S['faculty.rejectShift'] = (ctx, a) => rejectCore(ctx, a.id, a.note);
  S['faculty.bulkApprove'] = (ctx, a) => bulkCore(ctx, a.ids);
  function loadReport(ctx, id) {
    const r = ctx.db.reports.find(x => x.id === id);
    if (!r) fail('Report not found.', 404);
    assertScope(ctx, r.student_id);
    return r;
  }
  S['faculty.approveReport'] = (ctx, a) => {
    const r = loadReport(ctx, a.id); r.status = 'APPROVED'; r.feedback = '';
    const u = studentOf(ctx.db, r.student_id);
    notify(ctx.db, [r.student_id], `Your narrative report "${r.title}" was approved.`, 'narrative.html');
    log(ctx, 'Approved narrative', `${u.first_name} ${u.last_name}`, r.title);
    return { ok: true };
  };
  S['faculty.reviseReport'] = (ctx, a) => {
    const r = loadReport(ctx, a.id);
    if (!String(a.feedback || '').trim()) fail('Please write feedback for the student.');
    r.status = 'REVISION'; r.feedback = String(a.feedback).trim();
    const u = studentOf(ctx.db, r.student_id);
    notify(ctx.db, [r.student_id], `Your adviser asked for a revision of "${r.title}".`, 'narrative.html');
    log(ctx, 'Requested revision', `${u.first_name} ${u.last_name}`, r.title);
    return { ok: true };
  };
  S['faculty.updateTrainee'] = (ctx, a) => {
    assertScope(ctx, a.sid);
    const db = ctx.db, u = studentOf(db, a.sid), o = ojtOf(db, a.sid);
    if (!u || !o) fail('Trainee not found.', 404);
    const usr = a.user || {}, ojt = a.ojt || {};
    ['first_name', 'last_name', 'program', 'section', 'email'].forEach(k => { if (usr[k] != null) u[k] = usr[k]; });
    if (!u.first_name || !u.last_name) fail('First and last name are required.');
    const { status, ...rest } = ojt;          // company → staff.reassignCompany, schedule → staff.updateSchedule
    ['target_hours', 'start_date', 'end_date'].forEach(k => { if (rest[k] != null) o[k] = rest[k]; });
    o.target_hours = +o.target_hours;
    if (!(o.target_hours >= 1 && o.target_hours <= 2000)) fail('Target hours must be between 1 and 2000.');
    if (status === 'ON_HOLD') o.status = 'ON_HOLD'; else { if (o.status === 'ON_HOLD') o.status = 'ACTIVE'; syncStatus(db, a.sid); }
    log(ctx, 'Updated trainee', `${u.first_name} ${u.last_name}`, a.sid);
    return { ok: true };
  };
  S['faculty.addTrainee'] = (ctx, a) => {
    const db = ctx.db, st = settingsOf(db);
    ['first_name', 'last_name', 'student_id', 'username', 'password'].forEach(k => { if (!String(a[k] || '').trim()) fail('Please fill in all required fields.'); });
    if (a.password.length < 6) fail('Password must be at least 6 characters.');
    if (db.users.some(u => u.username.toLowerCase() === a.username.toLowerCase())) fail('That username is already taken.');
    if (db.users.some(u => u.student_id === a.student_id)) fail('That student ID already exists.');
    const comp = companyOf(db, a.company_id);
    if (!comp) fail('Please choose a company.');
    const adviserId = ctx.user.role === 'ADVISER' ? ctx.user.adviser_id : null;
    db.users.push({ username: a.username, password: a.password, role: 'EDUC_INTERN', student_id: a.student_id, adviser_id: adviserId, first_name: a.first_name, last_name: a.last_name,
      program: a.program || '', section: a.section || '', email: a.email || '', theme: 'light', schedule: { start: st.shift_start, end: st.shift_end } });
    db.ojt_records.push({ student_id: a.student_id, company_id: comp.id, target_hours: +a.target_hours || st.required_hours, status: 'NOT_STARTED',
      start_date: a.start_date || U.dateStr(), end_date: '', shift_start: st.shift_start, shift_end: st.shift_end, work_days: st.work_days });
    log(ctx, 'Added trainee', `${a.first_name} ${a.last_name}`, a.student_id);
    return { ok: true };
  };

  /* ------------------------------------------------------------ staff (faculty + super admin) */
  S['staff.shiftPhotos'] = (ctx, a) => {
    const s = ctx.db.shifts.find(x => x.id === a.id);
    if (!s) fail('Attendance record not found.', 404);
    assertScope(ctx, s.student_id);
    const d = decorate(ctx.db, s, true);
    return { id: s.id, studentName: d.studentName, date: s.date, time_in: s.time_in, time_out: s.time_out, gps_status: s.gps_status, distance_m: s.distance_m,
      photo_in: s.photo_in, photo_out: s.photo_out, face_in: s.face_in, face_out: s.face_out, flags: s.flags || [] };
  };
  S['staff.resetTraineePassword'] = (ctx, a) => {
    assertScope(ctx, a.sid);
    const u = studentOf(ctx.db, a.sid); const tp = tempPassword(); u.password = tp; u.must_change = true;
    log(ctx, 'Reset trainee password', `${u.first_name} ${u.last_name}`, a.sid);
    return { temporary_password: tp };
  };
  S['staff.resetFace'] = (ctx, a) => {
    assertScope(ctx, a.sid);
    const u = studentOf(ctx.db, a.sid);
    ctx.db.face_profiles = ctx.db.face_profiles.filter(f => f.student_id !== a.sid);
    log(ctx, 'Removed trainee Face ID', `${u.first_name} ${u.last_name}`, a.sid);
    return { ok: true };
  };

  function companyList(db) {
    const today = U.dateStr();
    return db.companies.map(c => ({
      ...c, contract_file: undefined, has_contract_file: !!c.contract_file, moa_effective: moaEffective(c), daysLeft: c.moa_expiry ? Math.round((U.parseDate(c.moa_expiry) - U.parseDate(today)) / 864e5) : null,
      placed: db.ojt_records.filter(o => o.company_id === c.id).length,
      supervisors: supervisorsOf(db, c.id).map(s => ({ supervisor_id: s.supervisor_id, name: label(s), email: s.email, phone: s.phone, position: s.position }))
    }));
  }
  S['staff.companies'] = ctx => companyList(ctx.db);
  function companyFields(a) {
    const name = String(a.name || '').trim(), address = String(a.address || '').trim();
    if (!name || !address) fail('Company name and address are required.');
    const rad = parseInt(a.geofence_radius, 10);
    if (!(rad >= 50 && rad <= 5000)) fail('Radius must be between 50 and 5000 meters.');
    const hasLat = a.lat != null && a.lat !== '', hasLng = a.lng != null && a.lng !== '';
    if (hasLat !== hasLng) fail('Enter both latitude and longitude, or leave both empty.');
    if (hasLat && (Math.abs(+a.lat) > 90 || Math.abs(+a.lng) > 180)) fail('Those coordinates are not valid.');
    return { name, address, industry: a.industry || '', lat: hasLat ? +a.lat : null, lng: hasLng ? +a.lng : null, geofence_radius: rad,
      contact_person: a.contact_person || '', contact_email: a.contact_email || '', contact_phone: a.contact_phone || '' };
  }
  S['staff.createCompany'] = (ctx, a) => {
    const c = { id: MockDB.id('c'), is_partner: false, moa_status: 'PENDING', moa_expiry: null, ...companyFields(a) };
    ctx.db.companies.push(c); log(ctx, 'Added company', c.name, '');
    return { id: c.id };
  };
  S['staff.updateCompany'] = (ctx, a) => {
    const c = companyOf(ctx.db, a.id); if (!c) fail('Company not found.', 404);
    Object.assign(c, companyFields(a)); log(ctx, 'Updated company', c.name, `${c.lat != null ? c.lat + ', ' + c.lng : 'no coordinates'} • ${c.geofence_radius} m`);
    return { id: c.id };
  };

  const supView = (db, u) => {
    const ids = new Set(db.ojt_records.filter(o => o.company_id === u.company_id).map(o => o.student_id));
    const pend = db.shifts.filter(s => s.status === 'PENDING_VERIFICATION' && s.review_level === 'SUPERVISOR' && ids.has(s.student_id));
    const c = companyOf(db, u.company_id);
    return { ...u, name: label(u), company_name: c ? c.name : '—', trainees: ids.size, pending: pend.length, oldest_days: pend.length ? Math.max(...pend.map(ageDays)) : 0 };
  };
  S['staff.supervisors'] = ctx => ctx.db.users.filter(u => u.role === 'SUPERVISOR').map(u => supView(ctx.db, u))
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  function supFields(a, isNew) {
    ['first_name', 'last_name', 'email', 'company_id'].forEach(k => { if (!String(a[k] || '').trim()) fail('Please fill in all required fields.'); });
    if (!emailRe.test(a.email)) fail('Please enter a valid email address.');
    return { title: a.title || '', first_name: a.first_name.trim(), last_name: a.last_name.trim(), email: a.email.trim(), phone: a.phone || '', position: a.position || '', company_id: a.company_id };
  }
  S['staff.createSupervisor'] = (ctx, a) => {
    const db = ctx.db, f = supFields(a, true);
    if (!companyOf(db, f.company_id)) fail('Company not found.');
    if (!String(a.username || '').trim() || String(a.password || '').length < 6) fail('A username and a password of at least 6 characters are required.');
    if (db.users.some(u => u.username.toLowerCase() === a.username.toLowerCase())) fail('That username is already taken.');
    const nums = db.users.filter(u => u.role === 'SUPERVISOR').map(u => parseInt(String(u.supervisor_id).replace(/\D/g, ''), 10) || 0);
    const id = 'SUP-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
    db.users.push({ supervisor_id: id, username: a.username.trim(), password: a.password, role: 'SUPERVISOR', theme: 'light', ...f });
    // trainees' waiting items at this company that had no supervisor now go to the new supervisor
    db.shifts.forEach(s => { if (s.status === 'PENDING_VERIFICATION' && s.company_id === f.company_id && s.review_level === 'ADVISER' && !s.note) s.review_level = 'SUPERVISOR'; });
    log(ctx, 'Added company supervisor', `${f.first_name} ${f.last_name}`, id);
    return { id };
  };
  S['staff.updateSupervisor'] = (ctx, a) => {
    const u = ctx.db.users.find(x => x.role === 'SUPERVISOR' && x.supervisor_id === a.supervisor_id);
    if (!u) fail('Supervisor not found.', 404);
    const f = supFields(a); if (!companyOf(ctx.db, f.company_id)) fail('Company not found.');
    Object.assign(u, f); log(ctx, 'Updated company supervisor', label(u), u.supervisor_id);
    return { ok: true };
  };
  S['staff.resetSupervisorPassword'] = (ctx, a) => {
    const u = ctx.db.users.find(x => x.role === 'SUPERVISOR' && x.supervisor_id === a.supervisor_id);
    if (!u) fail('Supervisor not found.', 404);
    const tp = tempPassword(); u.password = tp; u.must_change = true; log(ctx, 'Reset supervisor password', label(u), u.supervisor_id);
    return { temporary_password: tp };
  };
  S['staff.deleteSupervisor'] = (ctx, a) => {
    const db = ctx.db, u = db.users.find(x => x.role === 'SUPERVISOR' && x.supervisor_id === a.supervisor_id);
    if (!u) fail('Supervisor not found.', 404);
    db.users = db.users.filter(x => x !== u);
    if (!supervisorsOf(db, u.company_id).length) db.shifts.forEach(s => { if (s.status === 'PENDING_VERIFICATION' && s.company_id === u.company_id && s.review_level === 'SUPERVISOR') s.review_level = 'ADVISER'; });
    log(ctx, 'Deleted company supervisor', label(u), u.supervisor_id);
    return { ok: true };
  };

  /* ------------------------------------------------------------ super admin */
  const requireAdviserId = (db, id) => { const u = adviserOf(db, id); if (!u) fail('Adviser not found.', 404); return u; };
  S['admin.counts'] = ctx => ({ students: ctx.db.users.filter(u => u.role === 'EDUC_INTERN').length, companies: ctx.db.companies.length, supervisors: ctx.db.users.filter(u => u.role === 'SUPERVISOR').length });
  S['admin.roster'] = ctx => ctx.db.users.filter(u => u.role === 'EDUC_INTERN').map(u => summarize(ctx.db, u.student_id));
  S['admin.advisers'] = ctx => {
    const db = ctx.db, st = settingsOf(db), roster = S['admin.roster'](ctx);
    return db.users.filter(u => u.role === 'ADVISER').map(u => {
      const mine = roster.filter(r => r.adviserId === u.adviser_id), ids = new Set(mine.map(r => r.sid));
      const pend = db.shifts.filter(s => s.status === 'PENDING_VERIFICATION' && ids.has(s.student_id));
      const slipsList = pend.filter(s => needsAdviser(s, st));
      const reps = db.reports.filter(r => r.status === 'PENDING' && ids.has(r.student_id));
      const oldest = [...slipsList.map(s => s.time_out || s.date), ...reps.map(r => r.submitted_at || r.date)].sort()[0];
      return { user: u, id: u.adviser_id, name: label(u), students: mine, count: mine.length, slips: slipsList.length, reports: reps.length, pending: slipsList.length + reps.length,
        awaitingSupervisor: pend.length - slipsList.length, oldestDays: oldest ? Math.max(0, Math.floor((Date.now() - new Date(oldest)) / 864e5)) : 0,
        avg: mine.length ? Math.round(mine.reduce((a, r) => a + r.pct, 0) / mine.length) : 0, flagged: mine.filter(r => r.flags.length).length };
    }).sort((a, b) => a.user.last_name.localeCompare(b.user.last_name));
  };
  S['admin.createAdviser'] = (ctx, a) => {
    const db = ctx.db;
    ['first_name', 'last_name', 'email', 'username', 'password'].forEach(k => { if (!String(a[k] || '').trim()) fail('Please fill in all required fields.'); });
    if (!emailRe.test(a.email)) fail('Please enter a valid email address.');
    if (a.password.length < 6) fail('Password must be at least 6 characters.');
    if (db.users.some(u => u.username.toLowerCase() === a.username.toLowerCase())) fail('That username is already taken.');
    const nums = db.users.filter(u => u.role === 'ADVISER').map(u => parseInt(String(u.adviser_id).replace(/\D/g, ''), 10) || 0);
    const id = 'ADV-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
    db.users.push({ adviser_id: id, username: a.username, password: a.password, role: 'ADVISER', title: a.title, first_name: a.first_name, last_name: a.last_name, department: a.department, email: a.email, theme: 'light' });
    log(ctx, 'Added adviser', `${a.first_name} ${a.last_name}`, id);
    return { id };
  };
  S['admin.updateAdviser'] = (ctx, a) => {
    const u = requireAdviserId(ctx.db, a.id);
    if (!String(a.first_name || '').trim() || !String(a.last_name || '').trim()) fail('First and last name are required.');
    if (!emailRe.test(a.email || '')) fail('Please enter a valid email address.');
    ['title', 'first_name', 'last_name', 'department', 'email'].forEach(k => { if (a[k] != null) u[k] = a[k]; });
    log(ctx, 'Updated adviser', label(u), a.id);
    return { ok: true };
  };
  S['admin.resetAdviserPassword'] = (ctx, a) => { const u = requireAdviserId(ctx.db, a.id); const tp = tempPassword(); u.password = tp; u.must_change = true; log(ctx, 'Reset adviser password', label(u), a.id); return { temporary_password: tp }; };
  S['admin.deleteAdviser'] = (ctx, a) => {
    const db = ctx.db;
    if (db.users.some(u => u.role === 'EDUC_INTERN' && u.adviser_id === a.id)) fail('This adviser still has trainees. Transfer them first.');
    const u = requireAdviserId(db, a.id);
    db.users = db.users.filter(x => x !== u); log(ctx, 'Deleted adviser', label(u), a.id);
    return { ok: true };
  };
  S['admin.transferCaseload'] = (ctx, a) => {
    const db = ctx.db, from = requireAdviserId(db, a.id), to = adviserOf(db, a.to);
    if (!to || to === from) fail('Choose a different adviser to transfer to.');
    let n = 0;
    db.users.filter(u => u.role === 'EDUC_INTERN' && u.adviser_id === a.id).forEach(u => { u.adviser_id = a.to; n++; });
    log(ctx, 'Transferred caseload', `${label(from)} → ${label(to)}`, `${n} trainee(s)`);
    return { moved: n };
  };
  S['admin.assign'] = (ctx, a) => {
    const db = ctx.db, adv = a.adviser_id ? adviserOf(db, a.adviser_id) : null;
    if (a.adviser_id && !adv) fail('Adviser not found.', 404);
    let n = 0;
    (a.sids || []).forEach(sid => { const u = studentOf(db, sid); if (u) { u.adviser_id = a.adviser_id || null; n++; } });
    log(ctx, adv ? 'Reassigned trainees' : 'Unassigned trainees', adv ? label(adv) : `${n} trainee(s)`, `${n} trainee(s)`);
    return { moved: n };
  };
  S['admin.setHold'] = (ctx, a) => {
    const db = ctx.db, o = ojtOf(db, a.sid), u = studentOf(db, a.sid);
    if (!o || !u) fail('Trainee not found.', 404);
    o.status = a.hold ? 'ON_HOLD' : 'ACTIVE'; syncStatus(db, a.sid);
    log(ctx, a.hold ? 'Put trainee on hold' : 'Resumed trainee', `${u.first_name} ${u.last_name}`, a.sid);
    return { ok: true };
  };
  S['admin.announcements'] = ctx => {
    const db = ctx.db, studs = db.users.filter(u => u.role === 'EDUC_INTERN');
    return db.announcements.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''))
      .map(a => ({ ...a, reach: a.audience === 'ALL' ? studs.length : studs.filter(u => u.adviser_id === a.audience).length }));
  };
  S['admin.postAnnouncement'] = (ctx, a) => {
    if (!String(a.title || '').trim()) fail('Please add a title.');
    if (String(a.message || '').trim().length < 5) fail('Please write a short message.');
    ctx.db.announcements.push({ id: MockDB.id('an'), title: a.title.trim(), message: a.message.trim(), audience: a.audience || 'ALL', priority: a.priority || 'normal',
      expires: a.expires || null, active: true, created: nowIso(), author: label(ctx.user) });
    log(ctx, 'Posted announcement', a.title, a.audience === 'ALL' ? 'All trainees' : a.audience);
    return { ok: true };
  };
  S['admin.toggleAnnouncement'] = (ctx, a) => { const x = ctx.db.announcements.find(y => y.id === a.id); if (x) { x.active = !x.active; log(ctx, x.active ? 'Showed announcement' : 'Hid announcement', x.title, ''); } return { ok: true }; };
  S['admin.removeAnnouncement'] = (ctx, a) => {
    const x = ctx.db.announcements.find(y => y.id === a.id);
    ctx.db.announcements = ctx.db.announcements.filter(y => y.id !== a.id);
    if (x) log(ctx, 'Deleted announcement', x.title, '');
    return { ok: true };
  };
  S['admin.settings'] = ctx => settingsOf(ctx.db);
  S['admin.saveProgram'] = (ctx, a) => {
    const hrs = parseInt(a.required_hours, 10);
    if (!(hrs >= 1 && hrs <= 2000)) fail('Required hours must be between 1 and 2000.');
    const f = scheduleFields({ days: a.days, start: a.shift_start, end: a.shift_end, break_min: a.break_min });
    ctx.db.settings = { ...settingsOf(ctx.db), required_hours: hrs, ...f };   // defaults for NEW trainees only; existing schedules are edited per trainee
    log(ctx, 'Changed program defaults', 'New trainees', `${hrs} h \u2022 ${f.shift_start} \u2013 ${f.shift_end}`);
    return { ok: true };
  };
  S['admin.applyRadius'] = (ctx, a) => {
    const r = parseInt(a.radius, 10);
    if (!(r >= 50 && r <= 5000)) fail('Radius must be between 50 and 5000 meters.');
    ctx.db.companies.forEach(c => { c.geofence_radius = r; });
    log(ctx, 'Applied geofence radius', 'All companies', `${r} m`);
    return { updated: ctx.db.companies.length };
  };
  S['admin.saveApprovalPolicy'] = (ctx, a) => {
    const thr = +a.face_threshold, esc_ = +a.escalate_days, mn = +a.min_shift_hours, mx = +a.max_shift_hours, rep = +a.face_repeat_after, brk = +a.break_min, gr = +a.grace_min;
    if (!(thr >= 0.3 && thr <= 0.8)) fail('Face match threshold must be between 0.30 and 0.80.');
    if (!(esc_ >= 1 && esc_ <= 30)) fail('Escalation days must be between 1 and 30.');
    if (!(mn >= 0 && mn <= 8)) fail('Minimum shift length must be between 0 and 8 hours.');
    if (!(mx >= 8 && mx <= 24)) fail('Maximum shift length must be between 8 and 24 hours.');
    if (!(rep >= 0 && rep <= 10)) fail('Repeated-face alert must be between 0 (off) and 10.');
    if (!(brk >= 0 && brk <= 180)) fail('Break must be between 0 and 180 minutes.');
    if (!(gr >= 0 && gr <= 60)) fail('Grace period must be between 0 and 60 minutes.');
    ctx.db.settings = { ...settingsOf(ctx.db), auto_approve: !!a.auto_approve, face_required: !!a.face_required, face_threshold: thr, escalate_days: esc_,
      min_shift_hours: mn, max_shift_hours: mx, face_repeat_after: rep, break_min: brk, grace_min: gr };
    log(ctx, 'Changed approval rules', `Auto-approve ${a.auto_approve ? 'on' : 'off'}`, `face \u2264 ${thr} \u2022 grace ${gr} min \u2022 escalate after ${esc_} d`);
    return { ok: true };
  };
  S['admin.audit'] = ctx => ctx.db.audit;


  /* ============================================================ DTR — generated automatically from attendance */
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const holidayOf = (db, ds) => (settingsOf(db).holidays || []).find(h => h.date === ds) || null;

  function dtrFor(db, sid, from, to) {
    const o = ojtOf(db, sid), st = settingsOf(db), today = U.dateStr(), sc = R.schedFrom(o, st);
    const start = o && o.start_date ? o.start_date : from, mine = db.shifts.filter(x => x.student_id === sid && x.date >= from && x.date <= to);
    const rows = [];
    for (let d = from, n = 0; d <= to && n < 70; d = U.addDays(d, 1), n++) {
      const sh = mine.find(x => x.date === d), dw = U.parseDate(d).getDay(), hol = holidayOf(db, d);
      if (!sh && (d > today || d < start)) continue;                                   // nothing to show for the future / before deployment
      const scheduled = sc.days.includes(dw);
      let state;
      if (sh) state = sh.status === 'TIMED_IN' ? 'ACTIVE' : 'PRESENT';
      else if (hol) state = 'HOLIDAY'; else if (!scheduled) state = 'REST'; else if (d === today) state = 'TODAY'; else state = 'ABSENT';
      const row = { date: d, dow: dw, state, scheduled, holiday: hol ? hol.name : null, shift_id: null };
      if (sh) Object.assign(row, { shift_id: sh.id, time_in: sh.time_in, time_out: sh.time_out, status: sh.status, sched_hours: sh.sched ? sh.sched.hours : sc.hours,
        worked_hours: sh.worked_hours != null ? sh.worked_hours : sh.computed_hours, regular_hours: sh.regular_hours != null ? sh.regular_hours : sh.computed_hours,
        late_min: sh.late_min || 0, under_min: sh.under_min || 0, ot_hours: sh.ot_hours || 0, ot_status: sh.ot_status || null,
        counted_hours: sh.status === 'APPROVED' ? sh.computed_hours : 0, hours: sh.computed_hours, flags: sh.flags || [], verified_by: sh.verified_by || '', approval_method: sh.approval_method || null,
        gps_status: sh.gps_status, face_in: sh.face_in && sh.face_in.status });
      rows.push(row);
    }
    const shifted = rows.filter(r => r.shift_id), sum_ = (arr, f) => R.hrs(arr.reduce((a, r) => a + (f(r) || 0), 0));
    const sched = rows.filter(r => r.scheduled && !r.holiday && r.state !== 'TODAY' && r.state !== 'REST');
    const totals = {
      required_days: sched.length, present: shifted.filter(r => r.status !== 'REJECTED').length, absent: rows.filter(r => r.state === 'ABSENT').length,
      late_count: shifted.filter(r => r.late_min).length, late_min: shifted.reduce((a, r) => a + r.late_min, 0), under_min: shifted.reduce((a, r) => a + r.under_min, 0),
      ot_hours: sum_(shifted, r => r.ot_hours), ot_approved: sum_(shifted.filter(r => r.ot_status === 'APPROVED'), r => r.ot_hours),
      regular_hours: sum_(shifted.filter(r => r.status === 'APPROVED'), r => r.regular_hours), counted_hours: sum_(shifted, r => r.counted_hours),
      pending_hours: sum_(shifted.filter(r => r.status === 'PENDING_VERIFICATION'), r => r.hours), pending_count: shifted.filter(r => r.status === 'PENDING_VERIFICATION' || r.status === 'ACTIVE').length,
      rejected: shifted.filter(r => r.status === 'REJECTED').length
    };
    const cert = db.dtr_certs.find(c => c.student_id === sid && c.from === from && c.to === to) || null;
    return { rows, totals, certification: cert, schedule: { days_label: sc.days_label, start: sc.start_label, end: sc.end_label, break_min: sc.brk, grace_min: sc.grace, hours: sc.hours } };
  }
  const canCertify = (ctx, sid) => {
    const o = ojtOf(ctx.db, sid), hasSup = o && supervisorsOf(ctx.db, o.company_id).length > 0;
    return ctx.user.role === 'SUPERVISOR' || (!hasSup && (ctx.user.role === 'ADVISER' || ctx.user.role === 'SUPER_ADMIN'));
  };
  function periodArgs(a) {
    if (!DATE_RE.test(a.from || '') || !DATE_RE.test(a.to || '') || a.from > a.to) fail('Please choose a valid period.');
    if (U.daysBetween(a.from, a.to) > 62) fail('The period cannot be longer than about two months.');
    return { from: a.from, to: a.to };
  }
  S['dtr.get'] = (ctx, a) => {
    const { db, user } = ctx, { from, to } = periodArgs(a);
    const sid = user.role === 'EDUC_INTERN' ? user.student_id : a.sid;
    if (!sid) fail('Choose a trainee.');
    if (user.role !== 'EDUC_INTERN') assertScope(ctx, sid);
    const u = studentOf(db, sid); if (!u) fail('Trainee not found.', 404);
    const o = ojtOf(db, sid), comp = o ? companyOf(db, o.company_id) : null, d = dtrFor(db, sid, from, to);
    return { student: { sid, name: `${u.first_name} ${u.last_name}`, program: u.program, section: u.section || '' }, company: comp ? { id: comp.id, name: comp.name } : null,
      supervisors: comp ? supervisorsOf(db, comp.id).map(label) : [], adviser: (adviserOf(db, u.adviser_id) ? label(adviserOf(db, u.adviser_id)) : ''),
      period: { from, to }, target: (o && o.target_hours) || settingsOf(db).required_hours, ...d, can_certify: user.role !== 'EDUC_INTERN' && canCertify(ctx, sid) && !d.certification };
  };
  S['dtr.summary'] = (ctx, a) => {
    const { db } = ctx, { from, to } = periodArgs(a);
    return scopeStudents(ctx).map(u => {
      const sid = u.student_id, o = ojtOf(db, sid), comp = o ? companyOf(db, o.company_id) : null, d = dtrFor(db, sid, from, to);
      return { sid, name: `${u.first_name} ${u.last_name}`, section: u.section || '', company: comp ? comp.name : '—', totals: d.totals, certification: d.certification,
        can_certify: canCertify(ctx, sid) && !d.certification, has_records: d.rows.some(r => r.shift_id) };
    }).sort((x, y) => x.name.localeCompare(y.name));
  };
  function certifyOne(ctx, sid, from, to, note) {
    const { db, user } = ctx;
    assertScope(ctx, sid);
    if (!canCertify(ctx, sid)) fail('Only the company supervisor can certify this DTR.', 403);
    if (to > U.dateStr()) fail('You cannot certify days that have not happened yet.');
    const d = dtrFor(db, sid, from, to);
    if (d.certification) fail('This DTR is already certified.');
    if (!d.rows.some(r => r.shift_id)) fail('There is no attendance in this period.');
    if (d.totals.pending_count) fail(`${d.totals.pending_count} record(s) are still waiting for review. Approve or reject them first.`);
    db.dtr_certs.push({ id: MockDB.id('dc'), student_id: sid, from, to, by: label(user), by_id: uidOf(user), at: nowIso(), note: String(note || '').slice(0, 300) });
    const u = studentOf(db, sid);
    notify(db, [sid, u.adviser_id], `${label(user)} certified the DTR of ${u.first_name} ${u.last_name} for ${U.fmtShortDate(from)} – ${U.fmtShortDate(to)}.`, 'dtr.html');
    log(ctx, 'Certified DTR', `${u.first_name} ${u.last_name}`, `${from} → ${to} • ${d.totals.counted_hours} h`);
  }
  S['dtr.certify'] = (ctx, a) => { const { from, to } = periodArgs(a); certifyOne(ctx, a.sid, from, to, a.note); return { ok: true }; };
  S['dtr.certifyMany'] = (ctx, a) => {
    const { from, to } = periodArgs(a), skipped = []; let certified = 0;
    (Array.isArray(a.sids) ? a.sids : []).forEach(sid => { try { certifyOne(ctx, sid, from, to, ''); certified++; } catch (e) { skipped.push({ sid, reason: e.message }); } });
    return { certified, skipped };
  };
  S['dtr.reopen'] = (ctx, a) => {
    const { from, to } = periodArgs(a); assertScope(ctx, a.sid);
    if (!canCertify(ctx, a.sid)) fail('Only the company supervisor can reopen this DTR.', 403);
    const before = ctx.db.dtr_certs.length;
    ctx.db.dtr_certs = ctx.db.dtr_certs.filter(c => !(c.student_id === a.sid && c.from === from && c.to === to));
    if (ctx.db.dtr_certs.length === before) fail('This DTR is not certified.');
    log(ctx, 'Reopened DTR', a.sid, `${from} → ${to}`);
    return { ok: true };
  };
  S['admin.saveHolidays'] = (ctx, a) => {
    const list = (Array.isArray(a.holidays) ? a.holidays : []).map(h => ({ date: String(h.date || ''), name: String(h.name || '').trim() }));
    if (list.some(h => !DATE_RE.test(h.date) || !h.name)) fail('Every holiday needs a date and a name.');
    if (list.length > 100) fail('Too many holidays.');
    ctx.db.settings = { ...settingsOf(ctx.db), holidays: list.sort((x, y) => x.date.localeCompare(y.date)) };
    log(ctx, 'Updated holidays', `${list.length} day(s)`, '');
    return { ok: true };
  };

  /* ============================================================ schedules (editable) */
  function scheduleFields(a) {
    const days = [...new Set((Array.isArray(a.days) ? a.days : []).map(Number))].filter(d => d >= 0 && d <= 6);
    if (!days.length) fail('Choose at least one work day.');
    const s0 = R.parseTime(a.start), e0 = R.parseTime(a.end);
    if (s0 == null || e0 == null) fail('Enter valid start and end times (for example 8:00 AM).');
    if (s0 === e0) fail('The start and end time cannot be the same.');
    const brk = a.break_min === '' || a.break_min == null ? 0 : parseInt(a.break_min, 10);
    if (!(brk >= 0 && brk <= 180)) fail('Break must be between 0 and 180 minutes.');
    const dur = ((e0 - s0 + 1440) % 1440) || 1440;
    if (dur > 16 * 60) fail('A shift cannot be longer than 16 hours.');
    return { shift_start: R.fmtTime(s0), shift_end: R.fmtTime(e0), work_days: R.fmtDays(days), break_min: brk };
  }
  function applySchedule(db, sid, f) {
    const o = ojtOf(db, sid), u = studentOf(db, sid);
    Object.assign(o, f); u.schedule = { start: f.shift_start, end: f.shift_end };
  }
  S['staff.updateSchedule'] = (ctx, a) => {
    assertScope(ctx, a.sid);
    const f = scheduleFields(a), db = ctx.db, u = studentOf(db, a.sid);
    if (!ojtOf(db, a.sid)) fail('This trainee has no placement yet.');
    applySchedule(db, a.sid, f);
    notify(db, [a.sid], `${label(ctx.user)} updated your schedule: ${f.work_days}, ${f.shift_start} – ${f.shift_end}.`, 'attendance.html');
    log(ctx, 'Updated schedule', `${u.first_name} ${u.last_name}`, `${f.work_days} • ${f.shift_start} – ${f.shift_end} • break ${f.break_min} min`);
    return { ok: true };
  };
  S['student.requestSchedule'] = (ctx, a) => {
    const { db, user } = ctx, f = scheduleFields(a), reason = String(a.reason || '').trim();
    if (reason.length < 5) fail('Please tell your supervisor why you need the change.');
    db.schedule_requests = db.schedule_requests.filter(r => !(r.student_id === user.student_id && r.status === 'PENDING'));
    db.schedule_requests.push({ id: MockDB.id('sr'), student_id: user.student_id, proposed: f, days: a.days, reason, status: 'PENDING', at: nowIso(), decided_by: null, note: '' });
    const o = ojtOf(db, user.student_id), sups = o ? supervisorsOf(db, o.company_id).map(x => x.supervisor_id) : [];
    notify(db, sups.length ? sups : [user.adviser_id], `${user.first_name} ${user.last_name} asked to change their schedule to ${f.work_days}, ${f.shift_start} – ${f.shift_end}.`, 'approvals.html');
    return { ok: true };
  };
  S['staff.scheduleRequests'] = ctx => {
    const ids = scopeIds(ctx), db = ctx.db;
    return db.schedule_requests.filter(r => r.status === 'PENDING' && ids.has(r.student_id)).map(r => {
      const u = studentOf(db, r.student_id), cur = R.schedFrom(ojtOf(db, r.student_id), settingsOf(db));
      return { ...r, studentName: `${u.first_name} ${u.last_name}`, current: { days_label: cur.days_label, start: cur.start_label, end: cur.end_label, break_min: cur.brk } };
    }).sort((a, b) => a.at.localeCompare(b.at));
  };
  S['staff.decideSchedule'] = (ctx, a) => {
    const db = ctx.db, r = db.schedule_requests.find(x => x.id === a.id && x.status === 'PENDING');
    if (!r) fail('That request is no longer waiting.', 404);
    assertScope(ctx, r.student_id);
    const u = studentOf(db, r.student_id);
    r.status = a.approve ? 'APPROVED' : 'REJECTED'; r.decided_by = label(ctx.user); r.note = String(a.note || '').trim(); r.decided_at = nowIso();
    if (a.approve) applySchedule(db, r.student_id, r.proposed);
    notify(db, [r.student_id], a.approve ? `Your schedule change was approved: ${r.proposed.work_days}, ${r.proposed.shift_start} – ${r.proposed.shift_end}.` : `Your schedule change was not approved${r.note ? ': ' + r.note : '.'}`, 'attendance.html');
    log(ctx, a.approve ? 'Approved schedule change' : 'Rejected schedule change', `${u.first_name} ${u.last_name}`, '');
    return { ok: true };
  };

  /* ============================================================ accomplishments with picture evidence */
  const IMG_RE = /^data:image\/(jpeg|png|webp);base64,/;
  function cleanEvidence(list, required) {
    const ev = Array.isArray(list) ? list : [];
    if (required && !ev.length) fail('Add at least one photo as evidence.');
    if (ev.length > 4) fail('You can attach up to 4 photos.');
    ev.forEach(f => { if (!IMG_RE.test(String(f.data || ''))) fail('Evidence must be a JPG, PNG or WebP photo.'); if (String(f.data).length > 900000) fail('One of the photos is too large.'); });
    return ev.map(f => ({ name: String(f.name || 'photo').slice(0, 80), type: f.type, data: f.data }));
  }
  S['student.accomplishments'] = ctx => ctx.db.accomplishments.filter(x => x.student_id === ctx.user.student_id).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  S['student.saveAccomplishment'] = (ctx, a) => {
    const { db, user } = ctx, title = String(a.title || '').trim(), description = String(a.description || '').trim(), hours = +a.hours;
    if (!title) fail('Please add a title.');
    if (description.length < 15) fail('Please describe what you did (a sentence or two).');
    if (!(hours > 0 && hours <= 24)) fail('Hours must be between 0 and 24.');
    const date = a.date || U.dateStr(); if (!DATE_RE.test(date) || date > U.dateStr()) fail('Choose a valid date (not in the future).');
    const evidence = cleanEvidence(a.evidence, true);
    let x = a.id ? db.accomplishments.find(y => y.id === a.id && y.student_id === user.student_id) : null;
    if (x && x.status === 'VERIFIED') fail('A verified accomplishment can no longer be edited.');
    if (!x) { x = { id: MockDB.id('ac'), student_id: user.student_id, created_at: nowIso(), verified_by: null, verified_at: null }; db.accomplishments.push(x); }
    Object.assign(x, { date, title: title.slice(0, 120), description: description.slice(0, 1500), hours, evidence, status: 'SUBMITTED', feedback: '' });
    const o = ojtOf(db, user.student_id), sups = o ? supervisorsOf(db, o.company_id).map(s => s.supervisor_id) : [];
    notify(db, sups.length ? sups : [user.adviser_id], `${user.first_name} ${user.last_name} logged an accomplishment: ${x.title}.`, 'approvals.html');
    return x;
  };
  S['student.deleteAccomplishment'] = (ctx, a) => {
    const x = ctx.db.accomplishments.find(y => y.id === a.id && y.student_id === ctx.user.student_id);
    if (!x || x.status === 'VERIFIED') fail('Only items that are not yet verified can be deleted.');
    ctx.db.accomplishments = ctx.db.accomplishments.filter(y => y !== x);
    return { ok: true };
  };
  S['staff.accomplishments'] = (ctx, a) => {
    const ids = scopeIds(ctx), db = ctx.db;
    return db.accomplishments.filter(x => ids.has(x.student_id) && (!a.sid || x.student_id === a.sid) && (!a.status || x.status === a.status))
      .map(x => { const u = studentOf(db, x.student_id), o = ojtOf(db, x.student_id), c = o && companyOf(db, o.company_id); return { ...x, studentName: `${u.first_name} ${u.last_name}`, section: u.section || '', companyName: c ? c.name : '' }; })
      .sort((p, q) => (p.status === 'SUBMITTED' ? 0 : 1) - (q.status === 'SUBMITTED' ? 0 : 1) || q.date.localeCompare(p.date));
  };
  S['staff.verifyAccomplishment'] = (ctx, a) => {
    const x = ctx.db.accomplishments.find(y => y.id === a.id); if (!x) fail('Accomplishment not found.', 404);
    assertScope(ctx, x.student_id);
    const fb = String(a.feedback || '').trim();
    if (!a.ok && !fb) fail('Please tell the trainee what to improve.');
    x.status = a.ok ? 'VERIFIED' : 'REVISION'; x.feedback = a.ok ? '' : fb; x.verified_by = a.ok ? label(ctx.user) : null; x.verified_at = a.ok ? nowIso() : null;
    notify(ctx.db, [x.student_id], a.ok ? `${label(ctx.user)} verified your accomplishment "${x.title}".` : `${label(ctx.user)} asked you to improve "${x.title}": ${fb}`, 'accomplishments.html');
    return { ok: true };
  };
  // narrative reports can include accomplishments (with their evidence) — expand the ids for the pages / printing
  const repView = (db, r) => ({ ...r, accomplishments: (r.accomplishment_ids || []).map(id => db.accomplishments.find(x => x.id === id)).filter(Boolean) });

  /* ============================================================ deployment, assignments, company reassignment */
  S['staff.reassignCompany'] = (ctx, a) => {
    const { db } = ctx; assertScope(ctx, a.sid);
    const o = ojtOf(db, a.sid), u = studentOf(db, a.sid), to = companyOf(db, a.company_id);
    if (!o || !u) fail('Trainee not found.', 404);
    if (!to) fail('Choose a company.');
    if (to.id === o.company_id) fail('The trainee is already placed at that company.');
    const reason = String(a.reason || '').trim(); if (reason.length < 3) fail('Please write the reason for the reassignment.');
    if (db.shifts.some(s => s.student_id === a.sid && s.status === 'TIMED_IN')) fail('The trainee is clocked in right now. Try again after they clock out.');
    const when = a.effective_date || U.dateStr(); if (!DATE_RE.test(when)) fail('Choose a valid effective date.');
    const from = companyOf(db, o.company_id), warnings = [];
    const moa = moaEffective(to); if (moa !== 'APPROVED' && moa !== 'NOT_REQUIRED') warnings.push(`${to.name} has no valid contract (${moa.toLowerCase()}).`);
    const used = db.ojt_records.filter(x => x.company_id === to.id).length; if (to.slots && used >= to.slots) warnings.push(`${to.name} is over its slot limit (${used}/${to.slots}).`);
    const oldSups = from ? supervisorsOf(db, from.id).map(x => x.supervisor_id) : [];
    db.placements.forEach(p => { if (p.student_id === a.sid && !p.end_date) p.end_date = when; });
    db.placements.push({ id: MockDB.id('pl'), student_id: a.sid, company_id: to.id, from_company_id: from ? from.id : null, start_date: when, end_date: null, reason, by: label(ctx.user), at: nowIso() });
    o.company_id = to.id;
    // records still waiting at the old company go to the adviser, so nothing gets stuck
    db.shifts.forEach(s => { if (s.student_id === a.sid && s.status === 'PENDING_VERIFICATION' && s.review_level === 'SUPERVISOR') s.review_level = 'ADVISER'; });
    const name = `${u.first_name} ${u.last_name}`;
    notify(db, [a.sid, u.adviser_id, ...oldSups, ...supervisorsOf(db, to.id).map(x => x.supervisor_id)], `${name} was reassigned from ${from ? from.name : 'no company'} to ${to.name} (effective ${U.fmtShortDate(when)}).`, 'deployment.html');
    log(ctx, 'Reassigned company', name, `${from ? from.name : '—'} → ${to.name} • ${reason}`);
    return { ok: true, warnings };
  };
  S['staff.remindFace'] = (ctx, a) => {
    const db = ctx.db, ids = scopeIds(ctx), want = Array.isArray(a.sids) && a.sids.length ? new Set(a.sids) : null;
    const todo = [...ids].filter(sid => (!want || want.has(sid)) && !db.face_profiles.some(f => f.student_id === sid));
    notify(db, todo, 'Please set up your Face ID (OJT Details → Face ID). It is needed to verify your attendance.', 'ojt-details.html#face');
    log(ctx, 'Sent Face ID reminder', `${todo.length} trainee(s)`, '');
    return { reminded: todo.length };
  };

  /* ============================================================ trace (supervisor) */
  S['supervisor.trace'] = ctx => {
    const { db } = ctx, today = U.dateStr();
    return scopeStudents(ctx).map(u => {
      const sid = u.student_id, sm = summarize(db, sid), comp = sm.company;
      const shifts = db.shifts.filter(x => x.student_id === sid).sort((x, y) => (y.time_in || '').localeCompare(x.time_in || ''));
      const last = shifts[0] || null, active = shifts.find(x => x.status === 'TIMED_IN');
      const trail = shifts.slice(0, 10).map(x => ({ id: x.id, date: x.date, time_in: x.time_in, time_out: x.time_out, status: x.status, gps_status: x.gps_status,
        lat: x.lat, lng: x.lng, distance_in: x.distance_m, lat_out: x.lat_out, lng_out: x.lng_out, distance_out: x.distance_out, face_in: x.face_in && x.face_in.status, face_out: x.face_out && x.face_out.status,
        late_min: x.late_min || 0, under_min: x.under_min || 0, ot_hours: x.ot_hours || 0, flags: x.flags || [] }));
      const state = active ? 'ON_DUTY' : (last && last.date === today) ? 'DONE' : sm.status === 'ACTIVE' || sm.status === 'NOT_STARTED' ? 'NOT_IN' : sm.status;
      return { sid, name: sm.name, section: u.section || '', status: sm.status, deployment: sm.deployment, state, schedule: sm.schedule,
        company: comp ? { name: comp.name, lat: comp.lat, lng: comp.lng, radius: comp.geofence_radius } : null,
        since: active ? active.time_in : null, last_seen: last ? (last.time_out || last.time_in) : null,
        last_location: last ? { lat: last.lat_out != null ? last.lat_out : last.lat, lng: last.lng_out != null ? last.lng_out : last.lng, distance_m: last.distance_out != null ? last.distance_out : last.distance_m, gps_status: last.gps_status } : null,
        trail };
    }).sort((a, b) => a.name.localeCompare(b.name));
  };

  /* ============================================================ accounts (super admin) */
  const userRow = (db, u) => {
    const base = { username: u.username, name: label(u), role: u.role, email: u.email || '', phone: u.phone || '', active: u.active !== false, must_change: !!u.must_change };
    if (u.role === 'EDUC_INTERN') { const o = ojtOf(db, u.student_id), c = o && companyOf(db, o.company_id); return { ...base, id: u.student_id, org: `${u.section || u.program || ''}${c ? ' • ' + c.name : ' • no company'}`, face: db.face_profiles.some(f => f.student_id === u.student_id) }; }
    if (u.role === 'SUPERVISOR') { const c = companyOf(db, u.company_id); return { ...base, id: u.supervisor_id, org: c ? c.name : '—' }; }
    return { ...base, id: u.adviser_id, org: u.department || '' };
  };
  S['admin.users'] = ctx => ctx.db.users.map(u => userRow(ctx.db, u)).sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  S['admin.createAdmin'] = (ctx, a) => {
    const db = ctx.db;
    ['first_name', 'last_name', 'email', 'username', 'password'].forEach(k => { if (!String(a[k] || '').trim()) fail('Please fill in all required fields.'); });
    if (!emailRe.test(a.email)) fail('Please enter a valid email address.');
    if (a.password.length < 6) fail('Password must be at least 6 characters.');
    if (db.users.some(u => u.username.toLowerCase() === a.username.toLowerCase())) fail('That username is already taken.');
    const nums = db.users.filter(u => u.role === 'SUPER_ADMIN').map(u => parseInt(String(u.adviser_id).replace(/\D/g, ''), 10) || 0);
    const id = 'SA-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
    db.users.push({ adviser_id: id, username: a.username.trim(), password: a.password, role: 'SUPER_ADMIN', title: a.title || '', first_name: a.first_name.trim(), last_name: a.last_name.trim(), department: a.department || 'OJT Coordination Office', email: a.email.trim(), theme: 'light', must_change: true });
    log(ctx, 'Added administrator', `${a.first_name} ${a.last_name}`, id);
    return { id };
  };
  S['admin.setUserActive'] = (ctx, a) => {
    const u = ctx.db.users.find(x => x.username === a.username); if (!u) fail('Account not found.', 404);
    if (u === ctx.user) fail('You cannot disable your own account.');
    if (!a.active && u.role === 'SUPER_ADMIN' && ctx.db.users.filter(x => x.role === 'SUPER_ADMIN' && x.active !== false).length <= 1) fail('There must be at least one active administrator.');
    u.active = !!a.active;
    log(ctx, a.active ? 'Enabled account' : 'Disabled account', label(u), u.username);
    return { ok: true };
  };
  S['admin.resetUserPassword'] = (ctx, a) => {
    const u = ctx.db.users.find(x => x.username === a.username); if (!u) fail('Account not found.', 404);
    const tp = tempPassword(); u.password = tp; u.must_change = true;
    log(ctx, 'Reset password', label(u), u.username);
    return { temporary_password: tp };
  };
  // bulk-create student accounts (hundreds at once). Returns the one-time temporary passwords.
  S['staff.importStudents'] = (ctx, a) => {
    const { db } = ctx, st = settingsOf(db), rows = Array.isArray(a.rows) ? a.rows : [];
    if (!rows.length) fail('The file has no rows.');
    if (rows.length > 1000) fail('Import at most 1000 students at a time.');
    const adviserId = ctx.user.role === 'ADVISER' ? ctx.user.adviser_id : (a.adviser_id || null);
    if (adviserId && !adviserOf(db, adviserId)) fail('Adviser not found.');
    const created = [], errors = [], taken = new Set(db.users.map(u => u.username.toLowerCase()));
    rows.forEach((r, i) => {
      const line = i + 2, sid = String(r.student_id || '').trim(), fn = String(r.first_name || '').trim(), ln = String(r.last_name || '').trim();
      if (!sid || !fn || !ln) { errors.push({ row: line, message: 'student_id, first_name and last_name are required.' }); return; }
      if (db.users.some(u => u.student_id === sid)) { errors.push({ row: line, message: `Student ID ${sid} already exists.` }); return; }
      const email = String(r.email || '').trim(); if (email && !emailRe.test(email)) { errors.push({ row: line, message: 'Invalid email.' }); return; }
      let comp = null;
      if (r.company) { comp = db.companies.find(c => c.id === r.company || c.name.toLowerCase() === String(r.company).trim().toLowerCase()); if (!comp) { errors.push({ row: line, message: `Company "${r.company}" was not found.` }); return; } }
      let base = (ln.replace(/\W/g, '') + fn[0]).toLowerCase() || sid, uname = base, n = 1;
      while (taken.has(uname)) uname = base + (++n);
      taken.add(uname);
      const pw = tempPassword();
      db.users.push({ username: uname, password: pw, must_change: true, role: 'EDUC_INTERN', student_id: sid, adviser_id: adviserId, first_name: fn, last_name: ln, program: r.program || '', section: r.section || '', email, theme: 'light', schedule: { start: st.shift_start, end: st.shift_end } });
      db.ojt_records.push({ student_id: sid, company_id: comp ? comp.id : null, target_hours: +r.target_hours || st.required_hours, status: 'NOT_STARTED', start_date: r.start_date || U.dateStr(), end_date: '', shift_start: st.shift_start, shift_end: st.shift_end, work_days: st.work_days });
      if (comp) db.placements.push({ id: MockDB.id('pl'), student_id: sid, company_id: comp.id, from_company_id: null, start_date: r.start_date || U.dateStr(), end_date: null, reason: 'Initial placement (import)', by: label(ctx.user), at: nowIso() });
      created.push({ student_id: sid, name: `${fn} ${ln}`, username: uname, temporary_password: pw });
    });
    log(ctx, 'Imported students', `${created.length} account(s)`, `${errors.length} error(s)`);
    return { created, errors };
  };

  /* ============================================================ contracts & partnerships */
  const FILE_RE = /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/;
  S['staff.contractFile'] = (ctx, a) => { const c = companyOf(ctx.db, a.id); if (!c || !c.contract_file) fail('No document attached.', 404); return c.contract_file; };
  S['admin.saveContract'] = (ctx, a) => {
    const c = companyOf(ctx.db, a.id); if (!c) fail('Company not found.', 404);
    const slots = a.slots === '' || a.slots == null ? 0 : parseInt(a.slots, 10);
    if (!(slots >= 0 && slots <= 500)) fail('Slots must be between 0 and 500.');
    if (!['APPROVED', 'PENDING', 'EXPIRED', 'NOT_REQUIRED'].includes(a.moa_status)) fail('Choose a contract status.');
    if (a.moa_status === 'APPROVED' && !a.moa_expiry) fail('Enter the date the contract is valid until.');
    if (a.signed_on && !DATE_RE.test(a.signed_on)) fail('Enter a valid signing date.');
    c.is_partner = !!a.is_partner; c.moa_status = a.moa_status; c.moa_expiry = a.moa_expiry || null; c.slots = slots;
    c.contract_type = String(a.contract_type || 'MOA').slice(0, 40); c.contract_ref = String(a.contract_ref || '').slice(0, 40); c.signed_on = a.signed_on || null; c.contract_notes = String(a.contract_notes || '').slice(0, 500);
    if (a.contract_file === null) c.contract_file = null;
    else if (a.contract_file) {
      if (!FILE_RE.test(String(a.contract_file.data || '')) || String(a.contract_file.data).length > 1800000) fail('Attach a PDF or photo of the signed contract (up to about 1.3 MB).');
      c.contract_file = { name: String(a.contract_file.name || 'contract').slice(0, 80), type: a.contract_file.type, data: a.contract_file.data };
    }
    (c.history = c.history || []).unshift({ at: nowIso(), by: label(ctx.user), action: 'Updated contract', detail: `${c.moa_status}${c.moa_expiry ? ' until ' + c.moa_expiry : ''}${c.contract_ref ? ' • ' + c.contract_ref : ''}` });
    log(ctx, 'Updated contract', c.name, `${c.moa_status}${c.moa_expiry ? ' until ' + c.moa_expiry : ''}${c.is_partner ? '' : ' • non-partner'}`);
    return { ok: true };
  };
  S['admin.renewContract'] = (ctx, a) => {
    const c = companyOf(ctx.db, a.id); if (!c) fail('Company not found.', 404);
    const today = U.dateStr(), base = c.moa_expiry && c.moa_expiry > today ? c.moa_expiry : today, [y, m, d] = base.split('-');
    c.moa_status = 'APPROVED'; c.moa_expiry = `${+y + 1}-${m}-${d}`; c.is_partner = true;
    (c.history = c.history || []).unshift({ at: nowIso(), by: label(ctx.user), action: 'Renewed for 1 year', detail: `Valid until ${c.moa_expiry}` });
    log(ctx, 'Renewed contract', c.name, `until ${c.moa_expiry}`);
    return { ok: true };
  };


  /* ------------------------------------------------------------ dispatcher */
  const SAVE_ON_GET = new Set(['messages.get']);

  window.ApiBackend = {
    async call(name, args, session, portal) {
      const fn = S[name], meta = META[name];
      if (!fn || !meta) fail('Unknown API call: ' + name, 404);
      await delay(name === 'auth.login' ? 350 : 25);
      const db = MockDB.load();
      let user = null;
      if (session && session.user) user = db.users.find(u => u.username === session.user.username) || null;
      const ctx = { db, user, portal };
      if (meta.roles !== 'public') {
        if (!user) fail('Please sign in.', 401);
        if (meta.roles !== 'any' && !meta.roles.split(',').includes(user.role)) fail('You do not have permission to do that.', 403);
      }
      const out = fn(ctx, JSON.parse(JSON.stringify(args || {})));
      if ((meta.method !== 'GET' || SAVE_ON_GET.has(name))) MockDB.save(db);
      // Never leak passwords to the page (a real API would never send them either).
      return out === undefined ? undefined : JSON.parse(JSON.stringify(out, (k, v) => (k === 'password' ? undefined : v)));
    }
  };
})();
