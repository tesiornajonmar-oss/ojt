(async () => {
  const me = await Shell.init('system');
  if (!me) return;
  const $ = id => document.getElementById(id);
  const SECS = ['policies', 'audit'];
  let counts, st, audit = [];
  try { [counts, st] = await Promise.all([API.admin.counts(), API.admin.settings()]); } catch (e) { return toast(e.message, 'err'); }

  function showSec(sec) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.sec === sec));
    SECS.forEach(s => { $('sec-' + s).hidden = s !== sec; });
    if (sec === 'audit') loadAudit();
  }
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => showSec(t.dataset.sec));
  const hash = location.hash.replace('#', '');
  showSec(SECS.includes(hash) ? hash : 'policies');

  /* ---- program defaults + geofence ---- */
  const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], IDX = [1, 2, 3, 4, 5, 6, 0];
  const to24 = lbl => { const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(lbl || ''); return m ? String((+m[1] % 12) + (/PM/i.test(m[3]) ? 12 : 0)).padStart(2, '0') + ':' + m[2] : ''; };
  const to12 = v => { const [h, m] = v.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
  const defDays = /every/i.test(st.work_days) ? [0, 1, 2, 3, 4, 5, 6] : (/–|-/.test(st.work_days) ? [1, 2, 3, 4, 5] : IDX.filter((d, i) => new RegExp(DN[i], 'i').test(st.work_days)));
  $('pHours').value = st.required_hours; $('pStart').value = to24(st.shift_start); $('pEnd').value = to24(st.shift_end); $('pBreak').value = st.break_min;
  $('pDays').innerHTML = DN.map((n, i) => `<label class="chip chip-neutral" style="cursor:pointer"><input type="checkbox" data-d="${IDX[i]}" ${defDays.includes(IDX[i]) ? 'checked' : ''}> ${n}</label>`).join('');
  $('applyNote').textContent = 'These are the defaults for trainees added or imported from now on. Existing trainees keep their own schedule — supervisors and advisers edit those one by one.';
  $('radiusNote').textContent = `Applies to all ${counts.companies} companies. Trainees are marked "In-Range" when they clock in inside this radius.`;
  guarded($('applyProgramBtn'), async () => {
    const err = $('pErr'); err.textContent = '';
    try { await API.admin.saveProgram({ required_hours: $('pHours').value, shift_start: $('pStart').value ? to12($('pStart').value) : '', shift_end: $('pEnd').value ? to12($('pEnd').value) : '', break_min: $('pBreak').value,
      days: [...document.querySelectorAll('#pDays [data-d]:checked')].map(c => +c.dataset.d) }); toast('Defaults saved.'); } catch (e) { err.textContent = e.message; }
  });
  guarded($('applyRadiusBtn'), async () => {
    const err = $('rErr'), r = parseInt($('rRadius').value, 10);
    if (!(r >= 50 && r <= 5000)) { err.textContent = 'Radius must be between 50 and 5000 meters.'; return; }
    err.textContent = '';
    if (!confirm(`Set the geofence radius to ${r} m for all ${counts.companies} companies?`)) return;
    try { const x = await API.admin.applyRadius({ radius: r }); toast(`Radius applied to ${x.updated} companies.`); } catch (e) { err.textContent = e.message; }
  });

  /* ---- approval rules ---- */
  $('rAuto').checked = !!st.auto_approve; $('rFace').checked = !!st.face_required; $('rGrace').value = st.grace_min; $('rBreak').value = st.break_min; $('rRep').value = st.face_repeat_after; $('rThr').value = st.face_threshold;
  $('rEsc').value = st.escalate_days; $('rMin').value = st.min_shift_hours; $('rMax').value = st.max_shift_hours;
  guarded($('saveRulesBtn'), async () => {
    try {
      await API.admin.saveApprovalPolicy({ auto_approve: $('rAuto').checked, face_required: $('rFace').checked, grace_min: $('rGrace').value, break_min: $('rBreak').value, face_repeat_after: $('rRep').value, face_threshold: $('rThr').value,
        escalate_days: $('rEsc').value, min_shift_hours: $('rMin').value, max_shift_hours: $('rMax').value });
      $('rulesErr').textContent = ''; toast('Approval rules saved.');
    } catch (e) { $('rulesErr').textContent = e.message; }
  });

  /* ---- password ---- */
  guarded($('pwBtn'), async () => {
    const err = $('pwErr'), o = $('pwOld').value, n = $('pwNew').value, n2 = $('pwNew2').value;
    if (n.length < 6) { err.textContent = 'New password must be at least 6 characters.'; return; }
    if (n !== n2) { err.textContent = 'The new passwords do not match.'; return; }
    try { await API.auth.changePassword({ old_password: o, new_password: n }); err.textContent = ''; $('pwOld').value = $('pwNew').value = $('pwNew2').value = ''; toast('Password changed.'); }
    catch (e) { err.textContent = e.message; }
  });

  /* ---- audit ---- */
  async function loadAudit() { try { audit = await API.admin.audit(); } catch (e) { return toast(e.message, 'err'); } renderAudit(); }
  function renderAudit() {
    const actors = [...new Set(audit.map(a => a.actor))], cur = $('aActor').value;
    $('aActor').innerHTML = '<option value="">All people</option>' + actors.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const q = $('aSearch').value.trim().toLowerCase(), who = $('aActor').value;
    const rows = audit.filter(a => (!who || a.actor === who) && (!q || `${a.action} ${a.target} ${a.detail}`.toLowerCase().includes(q)));
    $('aBody').innerHTML = rows.slice(0, 200).map(a => `<tr><td class="small" style="white-space:nowrap">${esc(U.fmtWhen(a.at))}</td><td>${esc(a.actor)}</td><td><b>${esc(a.action)}</b></td><td>${esc(a.target)}</td><td class="small audit-detail">${esc(a.detail)}</td></tr>`).join('');
    $('aEmpty').hidden = rows.length > 0;
  }
  $('aSearch').addEventListener('input', renderAudit); $('aActor').addEventListener('change', renderAudit);
  $('auditExport').onclick = () => { const rows = [['When', 'Who', 'Action', 'Target', 'Details']]; audit.forEach(a => rows.push([a.at, a.actor, a.action, a.target, a.detail])); downloadCsv(`OJT-audit-log-${U.dateStr()}.csv`, rows); };

  /* ---- holidays ---- */
  let hol = (st.holidays || []).map(h => ({ ...h }));
  const paintHol = () => { $('hList').innerHTML = hol.map((h, i) => `<span class="chip chip-neutral" style="margin:2px">${esc(U.fmtDateLong(h.date))} — ${esc(h.name)} <button class="att-x" data-rm="${i}" type="button" aria-label="Remove">✕</button></span>`).join('') || '<span class="small muted">No holidays set.</span>';
    $('hList').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { hol.splice(+b.dataset.rm, 1); paintHol(); }); };
  paintHol();
  $('hAdd').onclick = () => { if (!$('hDate').value || !$('hName').value.trim()) { $('hErr').textContent = 'Enter a date and a name.'; return; } $('hErr').textContent = ''; hol.push({ date: $('hDate').value, name: $('hName').value.trim() }); hol.sort((a, b) => a.date.localeCompare(b.date)); $('hName').value = ''; paintHol(); };
  guarded($('hSave'), async () => { try { await API.admin.saveHolidays({ holidays: hol }); toast('Holidays saved.'); } catch (e) { $('hErr').textContent = e.message; } });
})();
