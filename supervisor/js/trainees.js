(async () => {
  const me = await Shell.init('trainees');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let roster = [];


  // fill the "All sections" dropdown from the roster (keeps the current choice)
  function fillSections() {
    const el = $('fSection'), keep = el.value;
    const secs = [...new Set(roster.map(r => r.user.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    el.innerHTML = '<option value="">All sections</option>' + secs.map(x => `<option ${x === keep ? 'selected' : ''}>${esc(x)}</option>`).join('');
  }

  async function render() {
    try { roster = await API.supervisor.trainees(); } catch (e) { return toast(e.message, 'err'); }
    fillSections();
    const q = $('search').value.trim().toLowerCase(), st = $('fStatus').value, sec = $('fSection').value;
    const list = roster.filter(r => (!q || `${r.name} ${r.sid}`.toLowerCase().includes(q)) && (!st || r.status === st) && (!sec || r.user.section === sec)).sort((a, b) => a.user.last_name.localeCompare(b.user.last_name));
    $('countNote').textContent = `${roster.length} trainee${roster.length === 1 ? '' : 's'} placed at ${me.company_name}`;
    $('tbody').innerHTML = list.map(r => `<tr class="log-row" data-sid="${esc(r.sid)}">
      <td><b>${esc(r.name)}</b><div class="small muted">${esc(r.sid)} • ${esc(r.user.program)}${r.user.section ? ' • ' + esc(r.user.section) : ''}</div></td>
      <td class="prog-cell">${progBar(r)}<div class="small muted">${+r.approved.toFixed(1)} / ${r.target} h (${r.pct}%)</div></td>
      <td>${r.on_duty ? '<span class="pill-approved">🟢 On duty</span>' : r.today_done ? '<span class="small">✓ Submitted</span>' : '<span class="muted small">—</span>'}</td>
      <td>${statusChip(r.status)}</td>
      <td>${r.flags.length ? `<span class="chip chip-warn" title="${esc(r.flags.join(', '))}">⚠ ${r.flags.length}</span>` : '<span class="muted small">—</span>'}</td>
      <td><button class="btn btn-outline btn-sm" type="button">View</button></td></tr>`).join('');
    $('emptyNote').hidden = list.length > 0;
    $('tbody').querySelectorAll('tr').forEach(tr => tr.onclick = () => openDetail(tr.dataset.sid));
  }

  async function openDetail(sid) {
    let t;
    try { t = await API.supervisor.trainee({ sid }); } catch (e) { return toast(e.message, 'err'); }
    let r = t.summary; const o = r.ojt || {};
    let tab = 'overview';
    const bd = Modal.open({
      wide: true, title: `${esc(r.name)} <span class="muted small">${esc(sid)}</span>`,
      body: `<div class="tabs" id="dTabs"><button class="tab" data-t="overview" type="button">Overview</button><button class="tab" data-t="attendance" type="button">Attendance</button>
        <button class="tab" data-t="reports" type="button">Reports</button><button class="tab" data-t="evaluation" type="button">Evaluation</button></div><div id="dBody"></div>`,
      footer: '<button class="btn btn-outline" id="dPrint" type="button">📋 DTR</button><a class="btn btn-outline" href="evaluations.html">⭐ Evaluate</a><button class="btn btn-outline" id="dClose" type="button">Close</button>'
    });
    const q = s => bd.querySelector(s);
    function paint() {
      bd.querySelectorAll('#dTabs .tab').forEach(x => x.classList.toggle('active', x.dataset.t === tab));
      q('#dBody').innerHTML = tab === 'overview' ? `<div class="stat-strip"><div class="mini-stat"><b>${+r.approved.toFixed(1)} h</b>Approved</div><div class="mini-stat"><b>${+r.pending.toFixed(1)} h</b>Pending</div>
          <div class="mini-stat"><b>${+r.remaining.toFixed(1)} h</b>Remaining</div>${statusChip(r.status)}</div>
        <div class="kv"><span>Program</span><b>${esc(r.user.program)}</b></div><div class="kv"><span>Section</span><b>${esc(r.user.section || '—')}</b></div><div class="kv"><span>Email</span><b>${esc(r.user.email || '—')}</b></div>
        ${ReviewExtra.scheduleKv(r, true)}
        <div class="kv"><span>Training period</span><b>${U.fmtDateLong(o.start_date)} → ${o.end_date ? U.fmtDateLong(o.end_date) : 'open'}</b></div>
        <div class="kv"><span>Last activity</span><b>${r.last ? U.fmtDateLong(r.last) : 'None yet'}</b></div>
        ${r.flags.length ? `<div class="flag-list" style="margin-top:12px">${r.flags.map(f => `<span class="chip chip-warn">${esc(f)}</span>`).join('')}</div>` : ''}`
        : tab === 'attendance' ? Widgets.shiftTable(t.shifts) : tab === 'reports' ? Widgets.reportsTable(t.reports) : Widgets.evaluationView(t.evaluation);
      Widgets.bindPhotoButtons(q('#dBody'));
      if (tab === 'overview') ReviewExtra.bindSchedule(q('#dBody'), sid, r, async () => { t = await API.supervisor.trainee({ sid }); r = t.summary; paint(); });
    }
    bd.querySelectorAll('#dTabs .tab').forEach(x => x.onclick = () => { tab = x.dataset.t; paint(); });
    q('#dClose').onclick = () => Modal.close();
    q('#dPrint').onclick = () => { location.href = 'dtr.html?sid=' + encodeURIComponent(sid); };
    paint();
  }

  $('search').addEventListener('input', render); $('fStatus').addEventListener('change', render); $('fSection').addEventListener('change', render);
  await render();
  const sid = new URLSearchParams(location.search).get('sid');
  if (sid) openDetail(sid);
})();
