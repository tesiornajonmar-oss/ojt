(async () => {
  const me = await Shell.init('students');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let roster = [], companies = [];

  try { companies = await API.staff.companies(); } catch (e) { toast(e.message, 'err'); }
  $('fCompany').innerHTML = '<option value="">All companies</option>' + companies.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');


  // fill the "All sections" dropdown from the roster (keeps the current choice)
  function fillSections() {
    const el = $('fSection'), keep = el.value;
    const secs = [...new Set(roster.map(r => r.user.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    el.innerHTML = '<option value="">All sections</option>' + secs.map(x => `<option ${x === keep ? 'selected' : ''}>${esc(x)}</option>`).join('');
  }

  function filtered() {
    const q = $('search').value.trim().toLowerCase(), st = $('fStatus').value, co = $('fCompany').value, sec = $('fSection').value, sort = $('fSort').value;
    const list = roster.filter(r => (!q || `${r.name} ${r.sid}`.toLowerCase().includes(q)) && (!st || r.status === st) && (!co || (r.ojt && r.ojt.company_id === co)) && (!sec || r.user.section === sec));
    const cmp = { name: (a, b) => a.user.last_name.localeCompare(b.user.last_name), progress: (a, b) => b.pct - a.pct,
      idle: (a, b) => (a.last || '').localeCompare(b.last || ''), attention: (a, b) => b.flags.length - a.flags.length }[sort];
    return list.sort(cmp);
  }

  async function render() {
    try { roster = await API.faculty.roster(); } catch (e) { return toast(e.message, 'err'); }
    fillSections();
    const list = filtered();
    $('countNote').textContent = `${roster.length} trainee${roster.length === 1 ? '' : 's'} ${me.role === 'SUPER_ADMIN' ? 'in the program' : 'assigned to you'}`;
    $('tbody').innerHTML = list.map(r => `<tr class="log-row" data-sid="${esc(r.sid)}">
      <td><b>${esc(r.name)}</b><div class="small muted">${esc(r.sid)} • ${esc(r.user.program)}${r.user.section ? ' • ' + esc(r.user.section) : ''}</div></td>
      <td>${esc(r.company ? r.company.name : '—')}</td>
      <td class="prog-cell">${progBar(r)}<div class="small muted">${+r.approved.toFixed(1)} / ${r.target} h (${r.pct}%)${r.pending ? ` • +${+r.pending.toFixed(1)} pending` : ''}</div></td>
      <td>${statusChip(r.status)}</td><td>${moaChip(r.ojt ? r.ojt.moa_status : 'PENDING')}</td>
      <td>${r.flags.length ? `<span class="chip chip-warn" title="${esc(r.flags.join(', '))}">⚠ ${r.flags.length}</span>` : '<span class="muted small">—</span>'}</td>
      <td><button class="btn btn-outline btn-sm" type="button">View</button></td></tr>`).join('');
    $('emptyNote').hidden = list.length > 0;
    $('tbody').querySelectorAll('tr').forEach(tr => tr.onclick = () => openDetail(tr.dataset.sid));
  }

  /* ---------------- detail modal ---------------- */
  function overviewHtml(t) {
    const r = t.summary, o = r.ojt || {}, u = r.user;
    return `<div class="stat-strip">
        <div class="mini-stat"><b>${+r.approved.toFixed(1)} h</b>Approved</div><div class="mini-stat"><b>${+r.pending.toFixed(1)} h</b>Pending review</div>
        <div class="mini-stat"><b>${+r.remaining.toFixed(1)} h</b>Remaining</div>${statusChip(r.status)} ${moaChip(o.moa_status || 'PENDING')}
        <span class="face-chip ${t.face.enrolled ? 'face-ok' : 'face-warn'}">${t.face.enrolled ? 'Face ID set up' : 'No Face ID'}</span></div>
      <div class="form-grid">
        <div class="field"><label>First name</label><input id="fFirst" value="${esc(u.first_name)}"></div>
        <div class="field"><label>Last name</label><input id="fLast" value="${esc(u.last_name)}"></div>
        <div class="field"><label>Student ID</label><input value="${esc(u.student_id)}" disabled></div>
        <div class="field"><label>Username</label><input value="${esc(u.username)}" disabled></div>
        <div class="field"><label>Program</label><input id="fProgram" value="${esc(u.program)}"></div>
        <div class="field"><label>Section</label><input id="fSectionIn" value="${esc(u.section || '')}" placeholder="e.g., BSIT 4A"></div>
        <div class="field"><label>Email</label><input id="fEmail" type="email" value="${esc(u.email || '')}"></div>
        <div class="field full"><label>Company (HTE)</label><p>${r.company ? esc(r.company.name) : '<span class="muted">No company yet</span>'} <a class="small" href="deployment.html" style="margin-left:8px">Reassign in Deployment →</a></p></div>
        <div class="field"><label>Target hours</label><input id="fTarget" type="number" min="1" max="2000" value="${o.target_hours || 370}"></div>
        <div class="field"><label>Status</label><select id="fStatus2"><option value="AUTO" ${o.status === 'ON_HOLD' ? '' : 'selected'}>Automatic (based on hours)</option><option value="ON_HOLD" ${o.status === 'ON_HOLD' ? 'selected' : ''}>On hold</option></select></div>
        <div class="field"><label>Start date</label><input id="fStart" type="date" value="${esc(o.start_date || '')}"></div>
        <div class="field"><label>End date</label><input id="fEnd" type="date" value="${esc(o.end_date || '')}"></div>
        <div class="field full"><label>Schedule</label><div id="schHost">${ReviewExtra.scheduleKv(r, true)}${t.schedule_request ? '<div class="small late">A schedule change request from the trainee is waiting in Approvals.</div>' : ''}</div></div>
        <div class="field full"><label>Company supervisor(s)</label><p>${t.supervisors.map(s => esc(s.name)).join(', ') || '<span class="muted">None yet — you review this trainee\'s attendance yourself.</span>'}</p></div>
      </div><p class="error" id="dErr"></p>`;
  }

  async function openDetail(sid, startTab = 'overview') {
    let t;
    try { t = await API.faculty.trainee({ sid }); } catch (e) { return toast(e.message, 'err'); }
    let current = startTab;
    const bd = Modal.open({
      wide: true, title: `${esc(t.summary.name)} <span class="muted small">${esc(sid)}</span>`,
      body: `<div class="tabs" id="dTabs"><button class="tab" data-t="overview" type="button">Overview</button><button class="tab" data-t="attendance" type="button">Attendance</button>
          <button class="tab" data-t="reports" type="button">Reports</button><button class="tab" data-t="evaluation" type="button">Evaluation</button></div><div id="dBody"></div>`,
      footer: `<button class="btn btn-outline" id="dReset" type="button">Reset password</button><button class="btn btn-outline" id="dFace" type="button">Reset Face ID</button>
               <button class="btn btn-outline" id="dPrint" type="button">📋 DTR</button><button class="btn btn-outline" id="dClose" type="button">Close</button><button class="btn btn-navy" id="dSave" type="button">Save changes</button>`
    });
    const q = sel => bd.querySelector(sel);
    function renderTab() {
      bd.querySelectorAll('#dTabs .tab').forEach(x => x.classList.toggle('active', x.dataset.t === current));
      ['dSave', 'dReset', 'dFace'].forEach(id => { q('#' + id).hidden = current !== 'overview'; });
      q('#dFace').hidden = current !== 'overview' || !t.face.enrolled;
      q('#dBody').innerHTML = current === 'overview' ? overviewHtml(t) : current === 'attendance' ? Widgets.shiftTable(t.shifts) : current === 'reports' ? Widgets.reportsTable(t.reports) : Widgets.evaluationView(t.evaluation);
      Widgets.bindPhotoButtons(q('#dBody'));
      if (current === 'overview') ReviewExtra.bindSchedule(q('#dBody'), sid, t.summary, async () => { t = await API.faculty.trainee({ sid }); renderTab(); });
    }
    bd.querySelectorAll('#dTabs .tab').forEach(x => x.onclick = () => { current = x.dataset.t; renderTab(); });
    q('#dClose').onclick = () => Modal.close();
    q('#dPrint').onclick = () => { location.href = 'dtr.html?sid=' + encodeURIComponent(sid); };
    guarded(q('#dReset'), async () => {
      if (!confirm(`Reset ${t.summary.name}'s password ?`)) return;
      const r = await API.staff.resetTraineePassword({ sid }); toast('Password reset to: ' + r.temporary_password, 'ok', 6000);
    });
    guarded(q('#dFace'), async () => {
      if (!confirm('Remove this trainee\'s Face ID so they can enroll again?')) return;
      await API.staff.resetFace({ sid }); toast('Face ID removed.', 'warn'); t = await API.faculty.trainee({ sid }); renderTab(); render();
    });
    guarded(q('#dSave'), async () => {
      const g = id => q('#' + id).value.trim(), err = q('#dErr'), target = +g('fTarget');
      if (!g('fFirst') || !g('fLast')) { err.textContent = 'First and last name are required.'; return; }
      if (!(target >= 1 && target <= 2000)) { err.textContent = 'Target hours must be between 1 and 2000.'; return; }
      if (g('fEmail') && !emailRe.test(g('fEmail'))) { err.textContent = 'Please enter a valid email address.'; return; }
      if (g('fStart') && g('fEnd') && g('fEnd') <= g('fStart')) { err.textContent = 'End date must be after the start date.'; return; }
      try {
        await API.faculty.updateTrainee({ sid, user: { first_name: g('fFirst'), last_name: g('fLast'), program: g('fProgram'), section: g('fSectionIn'), email: g('fEmail') },
          ojt: { target_hours: target, start_date: g('fStart'), end_date: g('fEnd'), status: g('fStatus2') } });
        toast('Student details saved.'); t = await API.faculty.trainee({ sid }); renderTab(); render();
      } catch (e) { err.textContent = e.message; }
    });
    renderTab();
  }

  /* ---------------- add student ---------------- */
  function openAdd() {
    Modal.open({
      title: 'Add Student',
      body: `<div class="form-grid">
        <div class="field"><label>First name *</label><input id="aFirst"></div><div class="field"><label>Last name *</label><input id="aLast"></div>
        <div class="field"><label>Student ID *</label><input id="aSid" placeholder="2024-0001"></div><div class="field"><label>Program</label><input id="aProgram" value="BSIT – 4th Year"></div><div class="field"><label>Section</label><input id="aSection" placeholder="e.g., BSIT 4A"></div>
        <div class="field"><label>Username *</label><input id="aUser"></div><div class="field"><label>Temporary password *</label><input id="aPass" value="intern123"></div>
        <div class="field full"><label>Email</label><input id="aEmail" type="email"></div>
        <div class="field full"><label>Company (HTE) *</label><select id="aCompany">${companies.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.is_partner ? '' : ' (non-partner)'}</option>`).join('')}</select></div>
        <div class="field"><label>Target hours (blank = program default)</label><input id="aTarget" type="number" min="1" max="2000"></div>
        <div class="field"><label>Start date</label><input id="aStart" type="date" value="${U.dateStr()}"></div>
      </div><p class="error" id="aErr"></p>`,
      footer: '<button class="btn btn-outline" id="aCancel" type="button">Cancel</button><button class="btn btn-navy" id="aCreate" type="button">Create account</button>'
    });
    const g = id => $(id).value.trim();
    const suggest = () => { if (!$('aUser').value) $('aUser').value = (g('aFirst').charAt(0) + g('aLast')).toLowerCase().replace(/[^a-z0-9]/g, ''); };
    $('aFirst').addEventListener('blur', suggest); $('aLast').addEventListener('blur', suggest);
    $('aCancel').onclick = () => Modal.close();
    guarded($('aCreate'), async () => {
      const err = $('aErr');
      const f = { first_name: g('aFirst'), last_name: g('aLast'), student_id: g('aSid'), program: g('aProgram'), section: g('aSection'), username: g('aUser'), password: g('aPass'),
        email: g('aEmail'), company_id: g('aCompany'), target_hours: g('aTarget'), start_date: g('aStart') };
      if (!f.first_name || !f.last_name || !f.student_id || !f.username || !f.password) { err.textContent = 'Please fill in all fields marked with *.'; return; }
      if (f.password.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
      if (f.email && !emailRe.test(f.email)) { err.textContent = 'Please enter a valid email address.'; return; }
      try { await API.faculty.addTrainee(f); Modal.close(); toast(`Account created — username: ${f.username} • password: ${f.password}`, 'ok', 8000); render(); }
      catch (e) { err.textContent = e.message; }
    });
  }

  ['search', 'fStatus', 'fCompany', 'fSection', 'fSort'].forEach(id => $(id).addEventListener(id === 'search' ? 'input' : 'change', render));
  $('addBtn').onclick = openAdd; $('faceRemind').onclick = async () => { try { const r = await API.staff.remindFace({}); toast(r.reminded ? `Reminder sent to ${r.reminded} trainee(s).` : 'Everyone has set up Face ID.'); } catch (e) { toast(e.message, 'err'); } };
  $('impBtn').onclick = () => ReviewExtra.importStudents(render);
  $('exportBtn').onclick = () => {
    const rows = [['Student ID', 'Name', 'Program', 'Section', 'Company', 'Status', 'Approved Hours', 'Pending Hours', 'Target Hours', 'Completion %', 'MOA', 'Last Activity']];
    roster.forEach(r => rows.push([r.sid, r.name, r.user.program, r.user.section || '', r.company ? r.company.name : '', r.status, +r.approved.toFixed(2), +r.pending.toFixed(2), r.target, r.pct, r.ojt ? r.ojt.moa_status : '', r.last || '']));
    downloadCsv(`OJT-roster-${U.dateStr()}.csv`, rows);
  };
  await render();
  const sid = new URLSearchParams(location.search).get('sid');
  if (sid) openDetail(sid);
})();
