/* Shared review panels for supervisor + faculty: accomplishments (evidence) and schedule requests. */
const ReviewExtra = (() => {
  const evImgs = (a, cls = 'att-thumb') => (a.evidence || []).map((e, i) => `<img class="${cls}" src="${esc(e.data)}" alt="Evidence" data-ev="${esc(a.id)}:${i}" style="cursor:zoom-in">`).join('');
  function bindZoom(root, items) {
    root.querySelectorAll('[data-ev]').forEach(i => i.onclick = () => { const [id, n] = i.dataset.ev.split(':'); const a = items.find(x => x.id === id);
      Modal.open({ wide: true, title: esc(a.title), body: `<img src="${esc(a.evidence[+n].data)}" style="max-width:100%;border-radius:8px" alt="">` }); });
  }
  async function accomplishments(panel, reload, sid) {
    const items = await API.staff.accomplishments(sid ? { sid } : {}), todo = items.filter(a => a.status === 'SUBMITTED');
    if (!items.length) { panel.innerHTML = '<p class="muted center">No accomplishments have been logged yet.</p>'; return todo.length; }
    panel.innerHTML = items.map(a => `<div class="appr-card" style="grid-template-columns:1fr auto"><div>
      <div class="appr-title">${esc(a.studentName)} — ${esc(a.title)}</div><div class="appr-meta"><span>${U.fmtDateLong(a.date)}</span><b>${a.hours} h</b><span class="muted">${esc(a.companyName)}</span>
      <span class="${a.status === 'VERIFIED' ? 'pill-approved' : a.status === 'REVISION' ? 'pill-revision' : 'pill-pending'}">${a.status === 'VERIFIED' ? 'Verified' : a.status === 'REVISION' ? 'Needs improvement' : 'To verify'}</span></div>
      <p class="small" style="margin:6px 0">${esc(a.description)}</p><div class="att-row">${evImgs(a, 'att-thumb big')}</div></div>
      <div class="appr-actions">${a.status === 'SUBMITTED' ? `<button class="btn btn-green btn-sm" data-vok="${esc(a.id)}" type="button">✓ Verify</button><button class="btn btn-outline btn-sm" data-vno="${esc(a.id)}" type="button">✏️ Needs improvement</button>` : ''}</div></div>`).join('');
    bindZoom(panel, items);
    panel.querySelectorAll('[data-vok]').forEach(b => guarded(b, async () => { await API.staff.verifyAccomplishment({ id: b.dataset.vok, ok: true }); toast('Verified.'); reload(); }));
    panel.querySelectorAll('[data-vno]').forEach(b => guarded(b, async () => {
      const note = await Widgets.askNote({ title: 'Needs improvement', label: 'What should the trainee fix? *', placeholder: 'e.g., Please add a clearer photo of the finished work.', confirmText: 'Send back', required: true });
      if (note == null) return; await API.staff.verifyAccomplishment({ id: b.dataset.vno, ok: false, feedback: note }); toast('Sent back to the trainee.', 'warn'); reload(); }));
    return todo.length;
  }
  async function schedules(panel, reload) {
    const items = await API.staff.scheduleRequests();
    if (!items.length) { panel.innerHTML = '<p class="muted center">No schedule change requests.</p>'; return 0; }
    panel.innerHTML = items.map(r => `<div class="appr-card" style="grid-template-columns:1fr auto"><div><div class="appr-title">${esc(r.studentName)}</div>
      <div class="appr-meta"><span class="muted">Now: ${esc(r.current.days_label)}, ${esc(r.current.start)} – ${esc(r.current.end)}</span></div>
      <div class="appr-meta"><b>Wants: ${esc(r.proposed.work_days)}, ${esc(r.proposed.shift_start)} – ${esc(r.proposed.shift_end)} (break ${r.proposed.break_min} min)</b></div>
      <div class="small" style="margin-top:6px">📝 ${esc(r.reason)}</div></div>
      <div class="appr-actions"><button class="btn btn-green btn-sm" data-sok="${esc(r.id)}" type="button">✓ Approve</button><button class="btn btn-outline danger btn-sm" data-sno="${esc(r.id)}" type="button">✕ Decline</button></div></div>`).join('');
    panel.querySelectorAll('[data-sok]').forEach(b => guarded(b, async () => { await API.staff.decideSchedule({ id: b.dataset.sok, approve: true }); toast('Schedule updated.'); reload(); }));
    panel.querySelectorAll('[data-sno]').forEach(b => guarded(b, async () => {
      const note = await Widgets.askNote({ title: 'Decline schedule change', label: 'Reason (optional)', confirmText: 'Decline', danger: true });
      if (note == null) return; await API.staff.decideSchedule({ id: b.dataset.sno, approve: false, note }); toast('Declined.', 'warn'); reload(); }));
    return items.length;
  }
  /* schedule editor modal (staff) */
  function scheduleEditor(sid, cur, done, withReason) {
    const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], IDX = [1, 2, 3, 4, 5, 6, 0];
    const t24 = lbl => { const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(lbl || ''); if (!m) return ''; let h = +m[1] % 12 + (/PM/i.test(m[3]) ? 12 : 0); return String(h).padStart(2, '0') + ':' + m[2]; };
    const to12 = v => { const [h, m] = v.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
    Modal.open({ title: '🗓️ Edit schedule', body: `<div class="field"><label>Work days</label><div id="sdDays" style="display:flex;gap:6px;flex-wrap:wrap">${DN.map((n, i) => `<label class="chip chip-neutral" style="cursor:pointer"><input type="checkbox" data-d="${IDX[i]}" ${cur.days.includes(IDX[i]) ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>
      <div class="form-grid" style="margin-top:10px"><div class="field"><label>Time in</label><input id="sdS" type="time" value="${t24(cur.start_label)}"></div><div class="field"><label>Time out</label><input id="sdE" type="time" value="${t24(cur.end_label)}"></div>
      <div class="field"><label>Break (minutes)</label><input id="sdB" type="number" min="0" max="180" value="${cur.brk}"></div>
      <div class="field"><label>Presets</label><select id="sdP"><option value="">Choose…</option><option value="08:00|17:00|60">8:00 AM – 5:00 PM</option><option value="09:00|18:00|60">9:00 AM – 6:00 PM</option><option value="07:00|16:00|60">7:00 AM – 4:00 PM</option><option value="22:00|06:00|60">Night 10 PM – 6 AM</option></select></div></div>
      ${withReason ? '<div class="field full" style="margin-top:10px"><label>Why do you need this change? *</label><textarea id="sdR" rows="2"></textarea></div>' : ''}
      <p class="small muted" style="margin-top:8px">Late, undertime and overtime are computed from this schedule. A night shift ends the next morning.</p><p class="error" id="sdErr"></p>`,
      footer: '<button class="btn btn-outline" id="sdC" type="button">Cancel</button><button class="btn btn-navy" id="sdOk" type="button">Save schedule</button>' });
    const $ = id => document.getElementById(id);
    $('sdP').onchange = () => { const v = $('sdP').value; if (!v) return; const [a, b, c] = v.split('|'); $('sdS').value = a; $('sdE').value = b; $('sdB').value = c; };
    $('sdC').onclick = () => Modal.close();
    guarded($('sdOk'), async () => { try {
      const days = [...document.querySelectorAll('[data-d]:checked')].map(c => +c.dataset.d);
      if (!$('sdS').value || !$('sdE').value) throw new Error('Choose the start and end time.');
      await done({ days, start: to12($('sdS').value), end: to12($('sdE').value), break_min: $('sdB').value, reason: withReason ? $('sdR').value : undefined }); Modal.close(); } catch (e) { $('sdErr').textContent = e.message; } });
  }
  /* ---- CSV import of student accounts ---- */
  function parseCsv(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x.trim())) rows.push(row); row = []; } else f += c; }
    row.push(f); if (row.some(x => x.trim())) rows.push(row);
    const head = (rows.shift() || []).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  }
  function importStudents(done, advisers) {
    Modal.open({ wide: true, title: '📥 Import students (CSV)', body: `<p class="small">One row per student. Columns: <code>student_id, first_name, last_name, program, section, email, company, start_date, target_hours</code> (only the first three are required). Usernames and temporary passwords are created for you.</p>
      <p><a href="#" id="imTpl">⬇ Download template</a></p>
      ${advisers ? `<div class="field"><label>Faculty adviser for these students</label><select id="imAdv"><option value="">— none yet —</option>${advisers.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></div>` : ''}
      <label class="dropzone" for="imFile"><input id="imFile" type="file" accept=".csv,text/csv" hidden><span>📄 <b>Choose the CSV file</b></span></label><div id="imOut" class="small" style="margin-top:10px"></div>`,
      footer: '<button class="btn btn-outline" id="imX" type="button">Close</button>' });
    const $ = id => document.getElementById(id);
    $('imX').onclick = () => Modal.close();
    $('imTpl').onclick = e => { e.preventDefault(); downloadBlob('students-template.csv', new Blob(['student_id,first_name,last_name,program,section,email,company,start_date,target_hours\n2026-0001,Juan,Dela Cruz,BSIT,3A,juan@example.com,,2026-11-10,370\n'], { type: 'text/csv' })); };
    $('imFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const rows = parseCsv(await f.text());
        if (!rows.length) { $('imOut').innerHTML = '<span class="error">The file has no rows.</span>'; return; }
        const res = await API.staff.importStudents({ rows, adviser_id: $('imAdv') ? $('imAdv').value || null : undefined });
        const q = v => `"${String(v).replace(/"/g, '""')}"`;
        $('imOut').innerHTML = `<b>${res.created.length} account(s) created.</b> ${res.errors.length ? `<span class="late">${res.errors.length} row(s) skipped:</span><ul>${res.errors.slice(0, 20).map(x => `<li>Row ${x.row}: ${esc(x.message)}</li>`).join('')}</ul>` : ''}
          ${res.created.length ? '<p class="small">Download the passwords now — they are shown only once. Students must change them at first login.</p><button class="btn btn-navy btn-sm" id="imDl" type="button">⬇ Download credentials</button>' : ''}`;
        if ($('imDl')) $('imDl').onclick = () => downloadBlob('new-student-accounts.csv', new Blob(['student_id,name,username,temporary_password\n' + res.created.map(c => [c.student_id, c.name, c.username, c.temporary_password].map(q).join(',')).join('\n')], { type: 'text/csv' }));
        if (res.created.length && done) done();
      } catch (err) { $('imOut').innerHTML = `<span class="error">${esc(err.message)}</span>`; }
      e.target.value = '';
    };
  }
  const scheduleKv = (r, canEdit) => `<div class="kv"><span>Schedule</span><b>${esc(r.schedule.days_label)}, ${esc(r.schedule.start)} – ${esc(r.schedule.end)} • break ${r.schedule.break_min} min ${canEdit ? '<button class="btn btn-outline btn-sm" id="schEdit" type="button" style="margin-left:8px">✏️ Edit</button>' : ''}</b></div>`;
  function bindSchedule(root, sid, r, done) {
    const b = root.querySelector('#schEdit'); if (!b) return;
    b.onclick = () => scheduleEditor(sid, { days: r.schedule.days, start_label: r.schedule.start, end_label: r.schedule.end, brk: r.schedule.break_min }, async f => { await API.staff.updateSchedule({ sid, ...f }); toast('Schedule updated.'); done(); });
  }
  return { scheduleKv, bindSchedule, accomplishments, schedules, scheduleEditor, bindZoom, evImgs, importStudents, parseCsv };
})();
