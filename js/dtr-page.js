/* Shared by all four portals: student sees own DTR; staff see a table of trainees in scope. */
(async () => {
  const portal = document.body.dataset.portal, me = await Shell.init('dtr');
  if (!me) return;
  const $ = id => document.getElementById(id), student = portal === 'student';
  const iso = d => U.dateStr(d), today = U.dateStr();
  const mFirst = (d = new Date()) => iso(new Date(d.getFullYear(), d.getMonth(), 1));
  const mLast = (d = new Date()) => iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const PRESETS = () => {
    const n = new Date(), p = new Date(n.getFullYear(), n.getMonth() - 1, 1), y = n.getFullYear(), m = String(n.getMonth() + 1).padStart(2, '0');
    return { 'this': ['This month', mFirst(), mLast()], first: ['1st – 15th (this month)', `${y}-${m}-01`, `${y}-${m}-15`], second: ['16th – end (this month)', `${y}-${m}-16`, mLast()],
      last: ['Last month', mFirst(p), mLast(p)], all: ['Last 60 days', iso(new Date(Date.now() - 59 * 864e5)), today] };
  };
  const P = PRESETS();
  $('fPreset').innerHTML = Object.entries(P).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('') + '<option value="custom">Custom dates…</option>';
  const setPreset = k => { if (P[k]) { $('fFrom').value = P[k][1]; $('fTo').value = P[k][2]; } };
  setPreset('this');
  $('fPreset').onchange = () => { setPreset($('fPreset').value); load(); };
  $('fFrom').onchange = $('fTo').onchange = () => { $('fPreset').value = 'custom'; load(); };
  const range = () => ({ from: $('fFrom').value, to: $('fTo').value });
  const h = n => (n ? +(+n).toFixed(2) : 0);
  const mins = m => m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`) : '';

  const stateCell = r => {
    if (!r.shift_id) return `<td colspan="7" class="muted small">${esc(r.holiday ? '🎌 ' + r.holiday : { REST: 'Rest day', ABSENT: '', TODAY: 'Today — not clocked in yet' }[r.state] || '')}${r.state === 'ABSENT' ? '<span class="late">Absent</span>' : ''}</td>`;
    return `<td>${U.fmtTime(r.time_in)} – ${r.time_out ? U.fmtTime(r.time_out) : '—'}</td><td>${h(r.regular_hours)}</td><td class="${r.late_min ? 'late' : 'muted'}">${mins(r.late_min) || '—'}</td>
      <td class="${r.under_min ? 'late' : 'muted'}">${mins(r.under_min) || '—'}</td><td>${r.ot_hours ? `<b>${h(r.ot_hours)}</b> <span class="chip ${r.ot_status === 'APPROVED' ? 'chip-ok' : 'chip-warn'}">${r.ot_status === 'APPROVED' ? 'counted' : 'pending'}</span>` : '<span class="muted">—</span>'}</td>
      <td><b>${h(r.counted_hours)}</b></td><td>${shiftStatusPill(r)}${r.flags && r.flags.some(f => f === 'OFF_SCHEDULE') ? ' <span class="chip chip-warn">rest day</span>' : ''}</td>`;
  };
  function detailHtml(d) {
    const t = d.totals, c = d.certification;
    return `<div class="dtr-sum"><div><b>${t.present}</b><span>of ${t.required_days} days present</span></div><div><b>${t.absent}</b><span>absent</span></div>
      <div><b>${mins(t.late_min) || '0'}</b><span>late (${t.late_count}×)</span></div><div><b>${mins(t.under_min) || '0'}</b><span>undertime</span></div>
      <div><b>${h(t.ot_approved)}</b><span>overtime counted${t.ot_hours > t.ot_approved ? ` / ${h(t.ot_hours - t.ot_approved)} h pending` : ''}</span></div><div><b>${h(t.counted_hours)}</b><span>hours counted</span></div></div>
      ${c ? `<div class="spot-note" style="border-color:#2e7d32">✔ Certified by <b>${esc(c.by)}</b> on ${U.fmtShortDate(c.at.slice(0, 10))}${c.note ? ' — ' + esc(c.note) : ''}</div>` : (t.pending_count ? `<div class="spot-note">⏳ ${t.pending_count} record(s) are still waiting for review — they are not counted yet.</div>` : '')}
      <p class="small muted">Schedule: ${esc(d.schedule.days_label)}, ${esc(d.schedule.start)} – ${esc(d.schedule.end)} • break ${d.schedule.break_min} min • grace ${d.schedule.grace_min} min</p>
      <div class="table-wrap"><table class="logs-table"><thead><tr><th>Date</th><th>Time in / out</th><th>Regular h</th><th>Late</th><th>Undertime</th><th>Overtime h</th><th>Counted h</th><th>Status</th></tr></thead><tbody>
      ${d.rows.map(r => `<tr class="${r.shift_id ? '' : 'row-off'}"><td>${U.fmtShortDate(r.date)} <span class="small muted">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][r.dow]}</span></td>${stateCell(r)}</tr>`).join('')}
      </tbody></table></div>`;
  }

  async function showDetail(sid) {
    const d = await API.dtr.get({ ...range(), sid });
    const certBtn = d.can_certify ? '<button class="btn btn-green" id="dCert" type="button">✔ Certify DTR</button>' : '';
    const reopen = d.certification && me.role !== 'EDUC_INTERN' ? '<button class="btn btn-outline" id="dReopen" type="button">Reopen</button>' : '';
    Modal.open({ title: `📋 ${esc(d.student.name)} — ${esc(d.company ? d.company.name : 'no company')}`, wide: true, body: detailHtml(d),
      footer: `${reopen}<button class="btn btn-outline" id="dPrint" type="button">🖨️ Print</button>${certBtn}` });
    $('dPrint').onclick = () => DTR.print(d);
    if ($('dCert')) guarded($('dCert'), async () => {
      const note = await Widgets.askNote({ title: 'Certify DTR', label: 'Remarks (optional)', placeholder: 'e.g., Verified against our logbook.', confirmText: 'Certify' });
      if (note == null) return; await API.dtr.certify({ sid, ...range(), note }); Modal.close(); toast('DTR certified.'); load();
    });
    if ($('dReopen')) guarded($('dReopen'), async () => { await API.dtr.reopen({ sid, ...range() }); Modal.close(); toast('DTR reopened.', 'warn'); load(); });
  }

  async function loadStudent() {
    const d = await API.dtr.get(range());
    $('panel').innerHTML = detailHtml(d) + '<div style="margin-top:12px"><button class="btn btn-navy" id="pr" type="button">🖨️ Print / Save as PDF</button></div>';
    $('pr').onclick = () => DTR.print(d);
  }

  let rows = [];
  function renderStaff() {
    const sec = $('fSection').value, q = $('fSearch').value.trim().toLowerCase();
    const list = rows.filter(r => (!sec || r.section === sec) && (!q || (r.name + ' ' + r.company).toLowerCase().includes(q)));
    const can = list.filter(r => r.can_certify && r.has_records && !r.totals.pending_count);
    $('panel').innerHTML = `<div class="bulk-bar"><span class="small muted">${list.length} trainee(s)</span>${me.role === 'EDUC_INTERN' ? '' : `<button class="btn btn-outline btn-sm" id="selReady" type="button">Select all ready to certify (${can.length})</button><button class="btn btn-green btn-sm" id="certSel" type="button">✔ Certify selected</button>`}</div>
      <div class="table-wrap"><table class="logs-table"><thead><tr><th></th><th>Trainee</th><th>Section</th><th>Company</th><th>Present</th><th>Absent</th><th>Late</th><th>Under</th><th>OT h</th><th>Counted h</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(r => { const t = r.totals, ready = r.can_certify && r.has_records && !t.pending_count;
        return `<tr><td><input type="checkbox" data-pick="${esc(r.sid)}" ${ready ? '' : 'disabled'}></td><td><b>${esc(r.name)}</b></td><td>${esc(r.section || '—')}</td><td class="small">${esc(r.company)}</td>
        <td>${t.present}/${t.required_days}</td><td class="${t.absent ? 'late' : ''}">${t.absent}</td><td>${mins(t.late_min) || '—'}</td><td>${mins(t.under_min) || '—'}</td>
        <td>${t.ot_hours ? h(t.ot_hours) : '—'}</td><td><b>${h(t.counted_hours)}</b></td>
        <td>${r.certification ? '<span class="pill-approved">Certified</span>' : t.pending_count ? `<span class="pill-pending">${t.pending_count} to review</span>` : r.has_records ? '<span class="chip chip-neutral">Ready</span>' : '<span class="muted small">No records</span>'}</td>
        <td><button class="btn btn-outline btn-sm" data-view="${esc(r.sid)}" type="button">View</button></td></tr>`; }).join('') || '<tr><td colspan="12" class="muted center">No trainees found.</td></tr>'}
      </tbody></table></div>`;
    $('panel').querySelectorAll('[data-view]').forEach(b => guarded(b, () => showDetail(b.dataset.view)));
    if ($('selReady')) {
      $('selReady').onclick = () => $('panel').querySelectorAll('[data-pick]:not(:disabled)').forEach(c => { c.checked = true; });
      guarded($('certSel'), async () => {
        const sids = Widgets.picked($('panel')); if (!sids.length) return toast('Tick the DTRs you want to certify first.', 'warn');
        if (!confirm(`Certify ${sids.length} DTR(s) for this period?`)) return;
        const r = await API.dtr.certifyMany({ sids, ...range() });
        toast(`${r.certified} certified${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}.`, r.skipped.length ? 'warn' : 'ok'); load();
      });
    }
  }
  async function loadStaff() {
    rows = await API.dtr.summary(range());
    const secs = [...new Set(rows.map(r => r.section).filter(Boolean))].sort(), keep = $('fSection').value;
    $('fSection').innerHTML = '<option value="">All sections</option>' + secs.map(s => `<option ${s === keep ? 'selected' : ''}>${esc(s)}</option>`).join('');
    renderStaff();
  }
  async function load() {
    const r = range();
    if (!r.from || !r.to || r.from > r.to) { $('panel').innerHTML = '<p class="muted">Choose a valid period.</p>'; return; }
    try { await (student ? loadStudent() : loadStaff()); } catch (e) { $('panel').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }
  if (!student) {
    $('fSection').hidden = false; $('fSearch').hidden = false; $('fSection').onchange = renderStaff; $('fSearch').oninput = renderStaff;
    $('pgNote').textContent = portal === 'supervisor' ? 'Review the period, then certify each trainee’s DTR. Certified DTRs are final until you reopen them.' : 'Auto-generated DTRs of the trainees in your scope. The company supervisor certifies them.';
  }
  const q = new URLSearchParams(location.search);
  load().then(() => { if (q.get('sid') && !student) showDetail(q.get('sid')).catch(() => {}); });
})();
