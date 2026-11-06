/* =====================================================================
   MOCK BACKEND (1/3) — fake database + demo data.
   DEMO ONLY. When your real backend exists: set USE_MOCK:false in js/config.js
   and delete the whole js/mock folder. Nothing else refers to it.
   Data lives in localStorage under one key, shared by all four portals.
   ===================================================================== */
const MockDB = (() => {
  const VERSION = 5;                       // bump this and old browser data is re-created automatically
  const KEY = 'ojt_erams_mock_db';
  const LEGACY_KEYS = ['ojt_erams_db', 'ojt_erams_session', 'ojt_erams_admin_session', 'ojt_erams_super_session'];

  let counter = 0;
  const id = p => p + Date.now().toString(36) + (++counter).toString(36) + Math.random().toString(36).slice(2, 5);

  function avatar(initials, caption) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='180'><rect width='240' height='180' fill='#e9e5d6'/>` +
      `<circle cx='120' cy='72' r='34' fill='#b9b29c'/><path d='M50 180c4-46 34-62 70-62s66 16 70 62z' fill='#b9b29c'/>` +
      `<text x='120' y='80' font-family='Arial' font-size='24' font-weight='bold' text-anchor='middle' fill='#fff'>${initials}</text>` +
      `<text x='120' y='170' font-family='Arial' font-size='11' text-anchor='middle' fill='#6b6757'>${caption}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function seed() {
    const today = U.dateStr();
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const label = u => `${u.title ? u.title + ' ' : ''}${u.first_name} ${u.last_name}`;

    const settings = {
      required_hours: 370, shift_start: '8:00 AM', shift_end: '5:00 PM', work_days: 'Monday – Friday',
      auto_approve: true, face_required: true, face_threshold: 0.5, face_repeat_after: 2, escalate_days: 3,
      min_shift_hours: 0, max_shift_hours: 12, break_min: 60, grace_min: 15,
      holidays: ['01-01|New Year\'s Day', '04-09|Araw ng Kagitingan', '05-01|Labor Day', '06-12|Independence Day', '11-01|All Saints\' Day', '11-30|Bonifacio Day',
        '12-08|Feast of the Immaculate Conception', '12-24|Christmas Eve', '12-25|Christmas Day', '12-30|Rizal Day', '12-31|New Year\'s Eve']
        .flatMap(h => [today.slice(0, 4), String(+today.slice(0, 4) + 1)].map(y => ({ date: `${y}-${h.split('|')[0]}`, name: h.split('|')[1] })))
    };

    const companies = [
      { id: 'c1', contract_type: 'MOA', contract_ref: 'MOA-2025-014', signed_on: U.addDays(today, -65), slots: 12, contract_notes: 'Government partner since 2023. Supervisor on site: IT Department Head.', contract_file: null, name: 'Malabon City Hall – IT Department', industry: 'Government', address: 'Malabon City Hall, Malabon City', lat: 14.6625, lng: 120.9568, geofence_radius: 300,
        is_partner: true, moa_status: 'APPROVED', moa_expiry: U.addDays(today, 300), contact_person: 'Ms. Liza Navarro', contact_email: 'lnavarro@malabon.gov.ph', contact_phone: '0917-555-0101' },
      { id: 'c2', contract_type: 'MOA', contract_ref: 'MOA-2025-022', signed_on: U.addDays(today, -325), slots: 8, contract_notes: 'Renewal letter already sent.', contract_file: null, name: 'Navotas Digital Solutions Inc.', industry: 'IT Services', address: 'C-4 Road, Navotas City', lat: 14.6667, lng: 120.9420, geofence_radius: 300,
        is_partner: true, moa_status: 'APPROVED', moa_expiry: U.addDays(today, 40), contact_person: 'Mr. Carlo Dizon', contact_email: 'cdizon@navotasdigital.ph', contact_phone: '0917-555-0102' },
      { id: 'c3', contract_type: 'MOA', contract_ref: 'MOA-2025-031', signed_on: U.addDays(today, -40), slots: 10, contract_notes: '', contract_file: null, name: 'BrightPath Software Corp.', industry: 'Software Development', address: 'EDSA, Caloocan City', lat: 14.6570, lng: 120.9840, geofence_radius: 300,
        is_partner: true, moa_status: 'APPROVED', moa_expiry: U.addDays(today, 420), contact_person: 'Ms. Hannah Uy', contact_email: 'huy@brightpath.ph', contact_phone: '0917-555-0103' },
      { id: 'c4', contract_type: 'MOA', contract_ref: 'MOA-2024-009', signed_on: U.addDays(today, -385), slots: 4, contract_notes: 'Expired — renewal pending signature.', contract_file: null, name: 'Tondo Network Services', industry: 'Telecommunications', address: 'Tondo, Manila', lat: 14.6180, lng: 120.9680, geofence_radius: 300,
        is_partner: true, moa_status: 'EXPIRED', moa_expiry: U.addDays(today, -20), contact_person: 'Mr. Ramon Cabrera', contact_email: 'rcabrera@tondonet.ph', contact_phone: '0917-555-0104' },
      { id: 'c5', contract_type: 'Endorsement letter', contract_ref: 'END-2026-003', signed_on: U.addDays(today, -10), slots: 3, contract_notes: 'Not yet a partner; endorsement only.', contract_file: null, name: 'Pioneer Web Studio', industry: 'Digital Agency', address: 'Quezon City', lat: 14.6760, lng: 121.0437, geofence_radius: 300,
        is_partner: false, moa_status: 'PENDING', moa_expiry: null, contact_person: 'Ms. Trina Lopez', contact_email: 'trina@pioneerweb.ph', contact_phone: '0917-555-0105' },
      { id: 'c6', contract_type: 'Internal agreement', contract_ref: 'INT-CMU-MIS', signed_on: U.addDays(today, -700), slots: 6, contract_notes: 'University office — no MOA required.', contract_file: null, name: 'CMU Management Information System Office', industry: 'Education', address: 'City of Malabon University, Malabon City', lat: 14.6584, lng: 120.9561, geofence_radius: 300,
        is_partner: true, moa_status: 'NOT_REQUIRED', moa_expiry: null, contact_person: 'Engr. Dante Flores', contact_email: 'mis@cmu.edu.ph', contact_phone: '0917-555-0106' }
    ];

    const users = [
      { username: 'sadmin', password: 'admin123', role: 'SUPER_ADMIN', adviser_id: 'SA-001', title: 'Dr.', first_name: 'Elena', last_name: 'Marquez',
        department: 'OJT Coordination Office', email: 'emarquez@cmu.edu.ph', theme: 'light' },
      { adviser_id: 'ADV-001', username: 'jdelacruz', password: 'adviser123', role: 'ADVISER', title: 'Prof.', first_name: 'Juan', last_name: 'Dela Cruz',
        department: 'College of Computer Studies', email: 'jdelacruz@cmu.edu.ph', theme: 'light' },
      { adviser_id: 'ADV-002', username: 'rbautista', password: 'adviser123', role: 'ADVISER', title: 'Prof.', first_name: 'Ricardo', last_name: 'Bautista',
        department: 'College of Computer Studies – Systems Development', email: 'rbautista@cmu.edu.ph', theme: 'light' },
      { adviser_id: 'ADV-003', username: 'mtorres', password: 'adviser123', role: 'ADVISER', title: 'Prof.', first_name: 'Maricel', last_name: 'Torres',
        department: 'College of Computer Studies – Networks & Security', email: 'mtorres@cmu.edu.ph', theme: 'light' },
      { supervisor_id: 'SUP-001', username: 'lnavarro', password: 'supervisor123', role: 'SUPERVISOR', title: 'Ms.', first_name: 'Liza', last_name: 'Navarro',
        position: 'IT Department Head', company_id: 'c1', email: 'lnavarro@malabon.gov.ph', phone: '0917-555-0101', theme: 'light' },
      { supervisor_id: 'SUP-002', username: 'cdizon', password: 'supervisor123', role: 'SUPERVISOR', title: 'Mr.', first_name: 'Carlo', last_name: 'Dizon',
        position: 'Operations Manager', company_id: 'c2', email: 'cdizon@navotasdigital.ph', phone: '0917-555-0102', theme: 'light' },
      { supervisor_id: 'SUP-003', username: 'huy', password: 'supervisor123', role: 'SUPERVISOR', title: 'Ms.', first_name: 'Hannah', last_name: 'Uy',
        position: 'Engineering Lead', company_id: 'c3', email: 'huy@brightpath.ph', phone: '0917-555-0103', theme: 'light' },
      { supervisor_id: 'SUP-004', username: 'dflores', password: 'supervisor123', role: 'SUPERVISOR', title: 'Engr.', first_name: 'Dante', last_name: 'Flores',
        position: 'MIS Officer', company_id: 'c6', email: 'mis@cmu.edu.ph', phone: '0917-555-0106', theme: 'light' }
    ];
    const hasSup = cid => users.some(u => u.role === 'SUPERVISOR' && u.company_id === cid);
    const supOf = cid => users.find(u => u.role === 'SUPERVISOR' && u.company_id === cid);
    const advOf = aid => users.find(u => u.adviser_id === aid && u.role === 'ADVISER');

    const plan = [
      { sid: '2023-0145', sec: 'BSIT 4A', u: 'presnilla',   f: 'Paolo',  l: 'Presnilla',  co: 'c1', adv: 'ADV-001', approved: 26, pending: 2 },
      { sid: '2023-0167', sec: 'BSIT 4A', u: 'areyes',      f: 'Ana',    l: 'Reyes',      co: 'c2', adv: 'ADV-002', approved: 38, pending: 1 },
      { sid: '2023-0188', sec: 'BSIT 4B', u: 'mvillanueva', f: 'Mark',   l: 'Villanueva', co: 'c3', adv: 'ADV-002', approved: 47, pending: 0, auto: 3 },
      { sid: '2023-0201', sec: 'BSIT 4A', u: 'rmendoza',    f: 'Rica',   l: 'Mendoza',    co: 'c4', adv: 'ADV-001', approved: 12, pending: 0, skip: 5 },
      { sid: '2023-0219', sec: 'BSIT 4B', u: 'psantiago',   f: 'Paul',   l: 'Santiago',   co: 'c1', adv: 'ADV-003', approved: 20, pending: 3, manualAt: 0, highAt: 1, oldPendingAt: 2 },
      { sid: '2023-0234', sec: 'BSIT 4B', u: 'jcruz',       f: 'Jessa',  l: 'Cruz',       co: 'c5', adv: 'ADV-003', approved: 5,  pending: 0 },
      { sid: '2023-0250', sec: 'BSIT 4C', u: 'docampo',     f: 'Daniel', l: 'Ocampo',     co: 'c3', adv: 'ADV-001', approved: 0,  pending: 0 }
    ];

    const ojt = [], shifts = [], reports = [], placements = [], accomplishments = [], dtr_certs = [], schedule_requests = [];
    const SC = MockRules.schedFrom({}, settings);
    // demo quirks: [index counting back from the newest workday] → late / early leave / overtime
    const quirks = {
      '2023-0145': { 3: { inH: 8, inM: 40 }, 5: { outH: 16, outM: 20 }, 1: { outH: 19, outM: 5 } },
      '2023-0167': { 4: { inH: 8, inM: 35 }, 8: { outH: 16, outM: 0 } },
      '2023-0219': { 6: { inH: 9, inM: 10 } }
    };

    function workdaysBack(count, skip) {
      const out = []; let off = 1;
      while (out.length < count + skip) {
        const ds = U.addDays(today, -off);
        const dow = U.parseDate(ds).getDay();
        if (dow !== 0 && dow !== 6) out.push(ds);
        off++;
      }
      return out.slice(skip);
    }

    plan.forEach(p => {
      const comp = companies.find(c => c.id === p.co);
      users.push({ username: p.u, password: 'intern123', role: 'EDUC_INTERN', student_id: p.sid, adviser_id: p.adv, first_name: p.f, last_name: p.l,
        program: 'BSIT – 4th Year', section: p.sec, email: `${p.u}@cmu.edu.ph`, theme: 'light', schedule: { start: '8:00 AM', end: '5:00 PM' } });

      const days = workdaysBack(p.pending + p.approved, p.skip || 0);
      const sup = supOf(comp.id), adv = advOf(p.adv);
      days.forEach((ds, i) => {
        const isPending = i < p.pending || p.oldPendingAt === i;
        const q = (quirks[p.sid] || {})[i] || {};
        const tin = U.parseDate(ds); tin.setHours(q.inH != null ? q.inH : 8, q.inM != null ? q.inM : rnd(0, 12));
        const tout = U.parseDate(ds); tout.setHours(q.outH != null ? q.outH : 17, q.outM != null ? q.outM : rnd(0, 25));
        const hours = 0;
        const manual = p.manualAt === i;
        const high = p.highAt === i;
        const auto = !isPending && p.auto && i >= p.pending && i < p.pending + p.auto;
        const sh = {
          id: id('s'), student_id: p.sid, company_id: comp.id, company: comp.name, date: ds,
          time_in: tin.toISOString(), time_out: tout.toISOString(), computed_hours: hours,
          status: isPending ? 'PENDING_VERIFICATION' : 'APPROVED',
          gps_status: manual ? 'Manual' : 'In-Range', distance_m: manual ? null : rnd(15, 180),
          lat: manual ? null : comp.lat + rnd(-120, 120) / 100000, lng: manual ? null : comp.lng + rnd(-120, 120) / 100000,
          lat_out: manual ? null : comp.lat + rnd(-120, 120) / 100000, lng_out: manual ? null : comp.lng + rnd(-120, 120) / 100000, distance_out: manual ? null : rnd(15, 180),
          photo_in: null, photo_out: null, face_in: null, face_out: null, flags: [], review_level: null,
          approval_method: null, verified_by: null, verified_at: null, note: ''
        };
        const sflags = MockRules.computeShift(sh, SC);
        if (isPending) {
          const ini = (p.f[0] + p.l[0]).toUpperCase();
          sh.photo_in = avatar(ini, 'demo photo • time in'); sh.photo_out = avatar(ini, 'demo photo • time out');
          sh.flags = [manual ? 'MANUAL_GPS' : null, high ? 'FACE_LOW' : 'FACE_NOT_ENROLLED'].concat(sflags).filter(Boolean);
          if (high) { sh.face_in = { status: 'LOW', score: 0.74, liveness: true }; sh.face_out = { status: 'LOW', score: 0.71, liveness: true }; }
          sh.review_level = hasSup(comp.id) ? 'SUPERVISOR' : 'ADVISER';
        } else if (auto) {
          sh.approval_method = 'AUTO'; sh.verified_by = 'Auto-verified'; sh.verified_at = tout.toISOString();
          sh.face_in = { status: 'MATCH', score: +(0.22 + Math.random() * 0.15).toFixed(3), liveness: true };
          sh.face_out = { status: 'MATCH', score: +(0.22 + Math.random() * 0.15).toFixed(3), liveness: true };
        } else {
          sh.approval_method = sup ? 'SUPERVISOR' : 'ADVISER';
          sh.verified_by = sup ? label(sup) : label(adv); sh.verified_at = tout.toISOString();
          sh.flags = sflags.filter(f => f === 'LATE' || f === 'UNDERTIME');
          if (sh.ot_hours > 0) sh.ot_status = 'DECLINED';
        }
        if (auto) sh.flags = sflags.filter(f => f === 'LATE' || f === 'UNDERTIME');
        shifts.push(sh);
      });

      const start = days.length ? days[days.length - 1] : today;
      placements.push({ id: id('pl'), student_id: p.sid, company_id: comp.id, from_company_id: null, start_date: start, end_date: null, reason: 'Initial placement', by: 'OJT Office', at: new Date().toISOString() });
      ojt.push({ student_id: p.sid, company_id: comp.id, target_hours: settings.required_hours, status: !days.length ? 'NOT_STARTED' : 'ACTIVE',
        start_date: start, end_date: U.addDays(start, 110), shift_start: '8:00 AM', shift_end: '5:00 PM', work_days: 'Monday – Friday' });
    });

    const rep = (sid, back, title, body, status, feedback) => reports.push({
      id: id('r'), student_id: sid, date: U.addDays(today, -back), title, body, status, feedback: feedback || '',
      submitted_at: status === 'DRAFT' ? null : new Date(Date.now() - back * 864e5).toISOString()
    });
    const lorem = w => `Week summary: ${w}. Tasks done this week included attending the orientation, setting up the development environment, and assisting the team with daily activities. Learned how the office handles requests and documentation.`;
    rep('2023-0145', 20, 'Week 1 – Orientation', lorem('orientation and office tour'), 'APPROVED');
    rep('2023-0145', 13, 'Week 2 – Helpdesk Support', lorem('helpdesk ticket handling'), 'APPROVED');
    rep('2023-0145', 2, 'Week 3 – Network Inventory', lorem('network equipment inventory'), 'PENDING');
    rep('2023-0167', 40, 'Week 1 – Onboarding', lorem('onboarding and tools'), 'APPROVED');
    rep('2023-0167', 33, 'Week 2 – Web Maintenance', lorem('website maintenance'), 'APPROVED');
    rep('2023-0167', 26, 'Week 3 – Database Cleanup', lorem('database cleanup'), 'APPROVED');
    rep('2023-0167', 3, 'Week 6 – Testing', 'Did some testing this week.', 'REVISION', 'Please add specific tasks, tools used and what you learned. At least two paragraphs.');
    [50, 43, 36, 29, 22].forEach((b, i) => rep('2023-0188', b, `Week ${i + 1} – Development`, lorem('feature development sprint ' + (i + 1)), 'APPROVED'));
    rep('2023-0201', 18, 'Week 1 – Orientation', lorem('orientation'), 'APPROVED');
    rep('2023-0219', 15, 'Week 1 – Onboarding', lorem('onboarding'), 'APPROVED');
    rep('2023-0219', 8, 'Week 2 – Documentation', lorem('technical documentation'), 'APPROVED');
    rep('2023-0219', 1, 'Week 3 – Server Checks', lorem('server room checks'), 'PENDING');
    rep('2023-0234', 1, 'Week 1 – Draft', 'Still writing…', 'DRAFT');

    /* sample conversations between company supervisors and faculty */
    const t1 = id('t'), t2 = id('t');
    const mins = m => new Date(Date.now() - m * 60000).toISOString();
    const threads = [
      { id: t1, student_id: '2023-0145', subject: 'Saturday barangay event — count the hours?', created_by: 'SUP-001', created_at: mins(300), last_at: mins(300), reads: { 'SUP-001': mins(300) } },
      { id: t2, student_id: '2023-0219', subject: 'Reminder: late attendance submissions', created_by: 'ADV-003', created_at: mins(2000), last_at: mins(1500), reads: { 'ADV-003': mins(1500) } }
    ];
    const messages = [
      { id: id('m'), thread_id: t1, sender: 'SUP-001', sender_name: 'Ms. Liza Navarro', sender_role: 'SUPERVISOR', at: mins(300),
        body: 'Good day, Prof. Dela Cruz. Paolo will assist at the barangay event this Saturday. Is it okay to count those hours toward his OJT?' },
      { id: id('m'), thread_id: t2, sender: 'ADV-003', sender_name: 'Prof. Maricel Torres', sender_role: 'ADVISER', at: mins(2000),
        body: 'Hello Ms. Navarro, Paul has two attendance records waiting for your review. Could you check them when you have a moment?' },
      { id: id('m'), thread_id: t2, sender: 'SUP-001', sender_name: 'Ms. Liza Navarro', sender_role: 'SUPERVISOR', at: mins(1500),
        body: 'Thanks for the reminder. I will review them tomorrow morning.' }
    ];
    threads[1].reads['SUP-001'] = mins(1500);
    const notifications = [
      { id: id('n'), uid: 'ADV-001', text: 'Ms. Liza Navarro sent a message about Paolo Presnilla.', link: 'messages.html?thread=' + t1, at: mins(300), read: false },
      { id: id('n'), uid: 'SUP-001', text: 'Prof. Maricel Torres sent a message about Paul Santiago.', link: 'messages.html?thread=' + t2, at: mins(2000), read: true }
    ];

    const evaluations = [{
      id: id('ev'), student_id: '2023-0188', supervisor_id: 'SUP-003', supervisor_name: 'Ms. Hannah Uy', company_id: 'c3',
      ratings: { attendance: 5, quality: 4, initiative: 5, teamwork: 4, communication: 4, technical: 5, professionalism: 5 },
      comments: 'Mark consistently delivered clean work and learned our stack quickly. He took initiative on the reporting module.',
      recommend: 'YES', status: 'SUBMITTED', updated_at: mins(4000), submitted_at: mins(4000)
    }];

    const announcements = [{
      id: id('an'), title: 'Live camera + Face ID for attendance', priority: 'normal', audience: 'ALL', expires: null, active: true, created: mins(900),
      author: 'Dr. Elena Marquez',
      message: 'Attendance now uses your live camera (no photo uploads). Set up Face ID once under OJT Details, then blink when asked at clock-in and clock-out. Your DTR is generated automatically.'
    }];

    /* daily accomplishments with picture evidence */
    const evidence = (title, color) => ({ name: title.toLowerCase().replace(/\W+/g, '-') + '.svg', type: 'image/svg+xml',
      data: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='220'><rect width='320' height='220' fill='${color}'/><text x='160' y='105' font-family='Arial' font-size='15' font-weight='bold' text-anchor='middle' fill='#fff'>Evidence photo</text><text x='160' y='130' font-family='Arial' font-size='12' text-anchor='middle' fill='#fff'>${title}</text></svg>`) });
    const acc = (sid, back, title, description, hours, status, color, feedback) => accomplishments.push({ id: id('ac'), student_id: sid, date: U.addDays(today, -back), title, description, hours,
      evidence: [evidence(title, color)], status, feedback: feedback || '', verified_by: status === 'VERIFIED' ? 'Ms. Liza Navarro' : null, verified_at: status === 'VERIFIED' ? new Date().toISOString() : null, created_at: new Date(Date.now() - back * 864e5).toISOString() });
    acc('2023-0145', 6, 'Network cabling inventory', 'Counted and labelled 48 network drops on the 2nd floor and recorded them in the asset sheet.', 6, 'VERIFIED', '#2a3d7c');
    acc('2023-0145', 4, 'Helpdesk ticket resolution', 'Resolved 12 printer and password-reset tickets and documented the fixes in the knowledge base.', 7, 'VERIFIED', '#3b6fd4');
    acc('2023-0145', 2, 'Installed office software', 'Installed and configured the document software on 6 workstations.', 5, 'SUBMITTED', '#2ca44f');
    acc('2023-0145', 1, 'Backup of shared folder', 'Ran the weekly backup and verified the restore of a sample file.', 3, 'REVISION', '#e8a317', 'Please add a photo that shows the backup report on screen.');
    acc('2023-0219', 3, 'Server room checks', 'Checked temperature logs and UPS status in the server room.', 6, 'SUBMITTED', '#7b5cff');

    // one certified DTR cut-off so the demo shows the "Certified" state
    dtr_certs.push({ id: id('dc'), student_id: '2023-0188', from: U.addDays(today, -60).slice(0, 8) + '01', to: U.addDays(today, -60).slice(0, 8) + '15', by: 'Ms. Hannah Uy', by_id: 'SUP-003', at: mins(3000), note: '' });

    return { version: VERSION, users, companies, ojt_records: ojt, shifts, reports, announcements, audit: [], settings,
      face_profiles: [], evaluations, threads, messages, notifications, placements, accomplishments, dtr_certs, schedule_requests };
  }

  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
    if (!d || d.version !== VERSION) {
      LEGACY_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
      d = seed();
      save(d);
    }
    return d;
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); }
    catch (e) { throw new Error('Browser storage is full (the demo keeps photos in your browser). Ask the Super Admin to reset the demo data.'); }
  }
  function reset() { localStorage.removeItem(KEY); return load(); }

  return { VERSION, KEY, id, load, save, reset, seed, avatar };
})();
