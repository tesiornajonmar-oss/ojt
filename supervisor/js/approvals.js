(async () => {
  const me = await Shell.init('approvals');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let q = null, tab = 'pending';

  async function load() {
    q = await API.supervisor.queue();
    const [a, sc] = await Promise.all([API.staff.accomplishments({ status: 'SUBMITTED' }), API.staff.scheduleRequests()]); counts = { acc: a.length, sched: sc.length };
    await render(); Shell.refresh();
  }

  async function pendingHandler(act, s, hrs) {
    if (act === 'ok' || act === 'okot') { await API.supervisor.approveShift({ id: s.id, hours: hrs === '' ? null : hrs, count_ot: act === 'okot' }); toast(act === 'okot' ? 'Approved with overtime.' : 'Attendance approved.'); return load(); }
    if (act === 'no') {
      const note = await Widgets.askNote({ title: 'Reject attendance', label: 'Reason (the trainee will see this)', placeholder: 'e.g., Not present at the office that day.', confirmText: 'Reject', required: true, danger: true });
      if (note == null) return; await API.supervisor.rejectShift({ id: s.id, note }); toast('Attendance rejected.', 'warn'); return load();
    }
    const note = await Widgets.askNote({ title: 'Escalate to faculty adviser', label: 'Note for the adviser (optional)', placeholder: 'e.g., I cannot confirm this — please check with the student.', confirmText: 'Escalate' });
    if (note == null) return; await API.supervisor.escalateShift({ id: s.id, note }); toast('Sent to the faculty adviser.'); return load();
  }
  let counts = { acc: 0, sched: 0 };
  async function render() {
    $('cPending').textContent = q.pending.length ? `(${q.pending.length})` : '';
    $('cAcc').textContent = counts.acc ? `(${counts.acc})` : ''; $('cSched').textContent = counts.sched ? `(${counts.sched})` : '';
    $('countNote').textContent = `${q.total} attendance record${q.total === 1 ? '' : 's'} to review`;
    $('bulkBtn').hidden = tab !== 'pending';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const panel = $('panel');
    if (tab === 'acc') { await ReviewExtra.accomplishments(panel, load); return; }
    if (tab === 'sched') { await ReviewExtra.schedules(panel, load); return; }
    if (!q.pending.length) { panel.innerHTML = '<p class="muted center">🎉 Nothing to review. Everything clean was verified automatically.</p>'; return; }
    const actions = [{ act: 'ok', label: '✓ Approve', cls: 'btn-green' }, { act: 'no', label: '✕ Reject', cls: 'btn-outline danger' }, { act: 'esc', label: '↗ Escalate', cls: 'btn-outline' }];
    panel.innerHTML = '<div class="bulk-bar"><button class="btn btn-outline btn-sm" id="selSafe" type="button">Select all low &amp; medium risk</button><span class="small muted">High-risk items always need a one-by-one review. Overtime is only counted with “Approve + OT”.</span></div>' +
      q.pending.map(s => Widgets.slipCard(s, { actions, pick: true })).join('');
    Widgets.bindSlips(panel, q.pending, pendingHandler);
    $('selSafe').onclick = () => panel.querySelectorAll('[data-pick]:not(:disabled)').forEach(c => { c.checked = true; });
  }

  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { tab = t.dataset.tab; render(); });
  guarded($('bulkBtn'), async () => {
    const ids = Widgets.picked($('panel'));
    if (!ids.length) return toast('Tick the records you want to approve first.', 'warn');
    if (!confirm(`Approve ${ids.length} record(s) with their recorded hours?`)) return;
    const r = await API.supervisor.bulkApprove({ ids });
    toast(`${r.approved} approved${r.skipped ? `, ${r.skipped} skipped (high risk)` : ''}.`, r.skipped ? 'warn' : 'ok', 5000);
    await load();
  });
  try { await load(); } catch (e) { toast(e.message, 'err'); }
})();
