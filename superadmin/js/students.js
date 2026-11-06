(async () => {
  const me = await Shell.init('students');
  if (!me) return;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search), selected = new Set();
  let roster = [], advisers = [];

  try { advisers = await API.admin.advisers(); } catch (e) { toast(e.message, 'err'); }
  const optHtml = advisers.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  $('fAdviser').innerHTML = '<option value="">All advisers</option><option value="none">Unassigned</option>' + optHtml;
  $('bulkTo').innerHTML = '<option value="">Reassign selected to…</option>' + optHtml + '<option value="none">— Unassigned —</option>';
  if (params.get('adviser')) $('fAdviser').value = params.get('adviser');
  if (params.get('attn')) $('fAttn').checked = true;
  const advName = id => { const a = advisers.find(x => x.id === id); return a ? a.name : null; };

  function fillSections() {
    const el = $('fSection'), keep = el.value;
    const secs = [...new Set(roster.map(r => r.user.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    el.innerHTML = '<option value="">All sections</option>' + secs.map(x => `<option ${x === keep ? 'selected' : ''}>${esc(x)}</option>`).join('');
  }

  function filtered() {
    const q = $('search').value.trim().toLowerCase(), ad = $('fAdviser').value, st = $('fStatus').value, sec = $('fSection').value, attn = $('fAttn').checked;
    return roster.filter(r => (!q || `${r.name} ${r.sid}`.toLowerCase().includes(q)) && (!ad || (ad === 'none' ? !r.adviserId : r.adviserId === ad)) && (!st || r.status === st) && (!sec || r.user.section === sec) && (!attn || r.flags.length))
      .sort((a, b) => a.user.last_name.localeCompare(b.user.last_name));
  }

  async function render() {
    try { [roster, advisers] = await Promise.all([API.admin.roster(), API.admin.advisers()]); } catch (e) { return toast(e.message, 'err'); }
    fillSections();
    const list = filtered();
    [...selected].forEach(id => { if (!list.some(r => r.sid === id)) selected.delete(id); });
    $('countNote').textContent = `${roster.length} trainees across ${advisers.length} advisers`;
    $('tbody').innerHTML = list.map(r => `<tr class="log-row" data-sid="${esc(r.sid)}">
        <td><input type="checkbox" class="rowchk" data-sid="${esc(r.sid)}" ${selected.has(r.sid) ? 'checked' : ''}></td>
        <td><b>${esc(r.name)}</b><div class="small muted">${esc(r.sid)} • ${esc(r.user.program)}${r.user.section ? ' • ' + esc(r.user.section) : ''}</div></td>
        <td>${r.adviserId ? esc(advName(r.adviserId)) : '<span class="chip chip-warn">Unassigned</span>'}</td>
        <td class="small">${esc(r.company ? r.company.name : '—')}</td>
        <td class="prog-cell">${progBar(r)}<div class="small muted">${+r.approved.toFixed(1)} / ${r.target} h (${r.pct}%)</div></td>
        <td>${statusChip(r.status)}</td>
        <td>${r.flags.length ? `<span class="chip chip-warn" title="${esc(r.flags.join(', '))}">⚠ ${r.flags.length}</span>` : '<span class="muted small">—</span>'}</td>
        <td><button class="btn btn-outline btn-sm" type="button">View</button></td></tr>`).join('');
    $('emptyNote').hidden = list.length > 0;
    $('selNote').textContent = selected.size ? `${selected.size} selected` : '';
    const all = $('selAll');
    all.checked = list.length > 0 && list.every(r => selected.has(r.sid));
    all.onchange = () => { list.forEach(r => { if (all.checked) selected.add(r.sid); else selected.delete(r.sid); }); render(); };
    $('tbody').querySelectorAll('.rowchk').forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = () => { if (c.checked) selected.add(c.dataset.sid); else selected.delete(c.dataset.sid); render(); }; });
    $('tbody').querySelectorAll('tr').forEach(tr => tr.onclick = () => openDetail(tr.dataset.sid));
  }

  async function openDetail(sid) {
    let t;
    try { t = await API.faculty.trainee({ sid }); } catch (e) { return toast(e.message, 'err'); }
    let tab = 'overview';
    const bd = Modal.open({
      wide: true, title: `${esc(t.summary.name)} <span class="muted small">${esc(sid)}</span>`,
      body: `<div class="tabs" id="dTabs"><button class="tab" data-t="overview" type="button">Overview</button><button class="tab" data-t="activity" type="button">Attendance</button>
        <button class="tab" data-t="reports" type="button">Reports</button><button class="tab" data-t="evaluation" type="button">Evaluation</button></div><div id="dBody"></div>`,
      footer: '<button class="btn btn-outline" id="dHold" type="button"></button><button class="btn btn-outline" id="dReset" type="button">Reset password</button><button class="btn btn-outline" id="dPrint" type="button">📋 DTR</button><button class="btn btn-outline" id="dClose" type="button">Close</button>'
    });
    const q = sel => bd.querySelector(sel);
    function overviewHtml() {
      const r = t.summary, o = r.ojt || {};
      return `<div class="stat-strip"><div class="mini-stat"><b>${+r.approved.toFixed(1)} h</b>Approved</div><div class="mini-stat"><b>${+r.pending.toFixed(1)} h</b>Pending review</div>
        <div class="mini-stat"><b>${+r.remaining.toFixed(1)} h</b>Remaining</div>${statusChip(r.status)} ${moaChip(o.moa_status || 'PENDING')}
        <span class="face-chip ${t.face.enrolled ? 'face-ok' : 'face-warn'}">${t.face.enrolled ? 'Face ID set up' : 'No Face ID'}</span></div>
        <div class="kv"><span>Program</span><b>${esc(r.user.program)}</b></div><div class="kv"><span>Company</span><b>${esc(r.company ? r.company.name : '—')}</b></div>
        <div class="kv"><span>Company supervisor(s)</span><b>${t.supervisors.map(s => esc(s.name)).join(', ') || '—'}</b></div>
        <div class="kv"><span>Required hours</span><b>${r.target} h</b></div>
        ${ReviewExtra.scheduleKv(r, true)}
        <div class="kv"><span>Training period</span><b>${o.start_date ? U.fmtDateLong(o.start_date) : '—'} → ${o.end_date ? U.fmtDateLong(o.end_date) : 'open'}</b></div>
        <div class="kv"><span>Last activity</span><b>${r.last ? U.fmtDateLong(r.last) : 'None yet'}</b></div>
        ${r.flags.length ? `<div class="flag-row" style="margin:12px 0">${r.flags.map(f => `<span class="chip chip-warn">${esc(f)}</span>`).join('')}</div>` : ''}
        <div class="field" style="margin-top:16px"><label>Assigned adviser</label><div class="inline-row"><select id="dAdviser"><option value="none" ${!r.adviserId ? 'selected' : ''}>— Unassigned —</option>
          ${advisers.map(a => `<option value="${esc(a.id)}" ${a.id === r.adviserId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
          <button class="btn btn-navy btn-sm" id="dAssign" type="button">Assign</button></div></div><p class="error" id="dErr"></p>`;
    }
    function paint() {
      bd.querySelectorAll('#dTabs .tab').forEach(x => x.classList.toggle('active', x.dataset.t === tab));
      q('#dBody').innerHTML = tab === 'overview' ? overviewHtml() : tab === 'activity' ? Widgets.shiftTable(t.shifts) : tab === 'reports' ? Widgets.reportsTable(t.reports) : Widgets.evaluationView(t.evaluation);
      q('#dHold').textContent = t.summary.status === 'ON_HOLD' ? '▶ Resume trainee' : '⏸ Put on hold';
      Widgets.bindPhotoButtons(q('#dBody'));
      if (tab === 'overview') ReviewExtra.bindSchedule(q('#dBody'), sid, t.summary, refresh);
      if (tab === 'overview') guarded(q('#dAssign'), async () => {
        const to = q('#dAdviser').value;
        try { await API.admin.assign({ sids: [sid], adviser_id: to === 'none' ? null : to }); toast('Adviser updated.'); await refresh(); } catch (e) { q('#dErr').textContent = e.message; }
      });
    }
    async function refresh() { t = await API.faculty.trainee({ sid }); paint(); render(); }
    bd.querySelectorAll('#dTabs .tab').forEach(x => x.onclick = () => { tab = x.dataset.t; paint(); });
    q('#dClose').onclick = () => Modal.close();
    q('#dPrint').onclick = () => { location.href = 'dtr.html?sid=' + encodeURIComponent(sid); };
    guarded(q('#dHold'), async () => { const hold = t.summary.status !== 'ON_HOLD'; await API.admin.setHold({ sid, hold }); toast(hold ? 'Trainee put on hold.' : 'Trainee resumed.', 'warn'); await refresh(); });
    guarded(q('#dReset'), async () => { if (!confirm(`Reset ${t.summary.name}'s password?`)) return; const r = await API.staff.resetTraineePassword({ sid }); toast('Password reset to: ' + r.temporary_password, 'ok', 6000); });
    paint();
  }

  guarded($('bulkBtn'), async () => {
    if (!selected.size) return toast('Select at least one trainee first.', 'warn');
    const to = $('bulkTo').value;
    if (!to) return toast('Choose who to reassign them to.', 'warn');
    const toName = to === 'none' ? 'no adviser' : advName(to);
    if (!confirm(`Reassign ${selected.size} trainee(s) to ${toName}?`)) return;
    const r = await API.admin.assign({ sids: [...selected], adviser_id: to === 'none' ? null : to });
    selected.clear(); $('bulkTo').value = ''; toast(`Reassigned ${r.moved} trainee(s) to ${toName}.`); render();
  });
  ['fAdviser', 'fStatus', 'fSection', 'fAttn'].forEach(id => $(id).addEventListener('change', render));
  $('search').addEventListener('input', render);
  $('exportBtn').onclick = () => {
    const rows = [['Adviser', 'Student ID', 'Name', 'Section', 'Company', 'Status', 'Approved Hours', 'Pending Hours', 'Target Hours', 'Completion %', 'MOA', 'Last Activity']];
    roster.forEach(r => rows.push([advName(r.adviserId) || 'Unassigned', r.sid, r.name, r.user.section || '', r.company ? r.company.name : '', r.status, +r.approved.toFixed(2), +r.pending.toFixed(2), r.target, r.pct, r.ojt ? r.ojt.moa_status : '', r.last || '']));
    downloadCsv(`OJT-system-report-${U.dateStr()}.csv`, rows);
  };
  render();
})();
