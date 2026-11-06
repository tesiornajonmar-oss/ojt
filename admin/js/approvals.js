(async () => {
  const me = await Shell.init('approvals');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let q = null, tab = 'needs';

  async function load() { q = await API.faculty.queue(); render(); Shell.refresh(); }

  function slipHandler(act, s, hrs) {
    if (act === 'ok' || act === 'okot') return API.faculty.approveShift({ id: s.id, hours: hrs === '' ? null : hrs, count_ot: act === 'okot' }).then(() => { toast('Attendance approved.'); return load(); });
    return Widgets.askNote({ title: 'Reject attendance', label: 'Reason (the trainee will see this)', placeholder: 'e.g., The photo does not show your face.', confirmText: 'Reject', required: true, danger: true })
      .then(async note => { if (note == null) return; await API.faculty.rejectShift({ id: s.id, note }); toast('Attendance rejected.', 'warn'); await load(); });
  }

  function render() {
    $('cNeeds').textContent = q.needsYou.length ? `(${q.needsYou.length})` : '';
    $('cWait').textContent = q.awaitingSupervisor.length ? `(${q.awaitingSupervisor.length})` : '';
    $('cReports').textContent = q.reports.length ? `(${q.reports.length})` : '';
    $('countNote').textContent = `${q.total} item${q.total === 1 ? '' : 's'} need you`;
    $('bulkBtn').hidden = tab !== 'needs';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const panel = $('panel');
    if (tab === 'acc') { ReviewExtra.accomplishments(panel, load); return; }
    if (tab === 'sched') { ReviewExtra.schedules(panel, load); return; }

    if (tab === 'needs' || tab === 'waiting') {
      const items = tab === 'needs' ? q.needsYou : q.awaitingSupervisor;
      if (!items.length) { panel.innerHTML = tab === 'needs' ? '<p class="muted center">🎉 Nothing needs you right now.</p>' : '<p class="muted center">Nothing is waiting on a company supervisor.</p>'; return; }
      const actions = [{ act: 'ok', label: tab === 'needs' ? '✓ Approve' : '✓ Approve anyway', cls: 'btn-green' }, { act: 'no', label: '✕ Reject', cls: 'btn-outline danger' }];
      panel.innerHTML = (tab === 'needs' ? '<div class="bulk-bar"><button class="btn btn-outline btn-sm" id="selSafe" type="button">Select all low &amp; medium risk</button><span class="small muted">High-risk items always need a one-by-one decision.</span></div>'
        : '<div class="spot-note">These are with the trainee\'s company supervisor. They reach you automatically after the escalation period, but you can step in now.</div>') +
        items.map(s => Widgets.slipCard(s, { actions, pick: tab === 'needs' })).join('');
      Widgets.bindSlips(panel, items, slipHandler);
      const sel = $('selSafe');
      if (sel) sel.onclick = () => panel.querySelectorAll('[data-pick]:not(:disabled)').forEach(c => { c.checked = true; });
    } else {
      if (!q.reports.length) { panel.innerHTML = '<p class="muted center">🎉 No narrative reports are waiting.</p>'; return; }
      panel.innerHTML = q.reports.map(r => `
        <div class="appr-card" style="grid-template-columns:1fr auto">
          <div><div class="appr-title">${esc(r.studentName)} — ${esc(r.title)}</div><div class="appr-meta"><span>${U.fmtDateLong(r.date)}</span></div>${r.body ? `<div class="report-body">${esc(r.body)}</div>` : '<div class="small muted">No typed text — see the attached copy.</div>'}${Widgets.attachmentsHtml(r)}</div>
          <div class="appr-actions"><button class="btn btn-green btn-sm" data-rok="${esc(r.id)}" type="button">✓ Approve</button>
            <button class="btn btn-outline btn-sm" data-rev="${esc(r.id)}" type="button">✏️ Request revision</button></div></div>`).join('');
      Widgets.bindAttachments(panel, q.reports);
      panel.querySelectorAll('[data-rok]').forEach(b => guarded(b, async () => { await API.faculty.approveReport({ id: b.dataset.rok }); toast('Report approved.'); await load(); }));
      panel.querySelectorAll('[data-rev]').forEach(b => guarded(b, async () => {
        const fb = await Widgets.askNote({ title: 'Request revision', label: 'What should the trainee fix? *', confirmText: 'Send feedback', required: true });
        if (fb == null) return;
        await API.faculty.reviseReport({ id: b.dataset.rev, feedback: fb }); toast('Revision requested.', 'warn'); await load();
      }));
    }
  }

  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { tab = t.dataset.tab; render(); });
  guarded($('bulkBtn'), async () => {
    const ids = Widgets.picked($('panel'));
    if (!ids.length) return toast('Tick the records you want to approve first.', 'warn');
    if (!confirm(`Approve ${ids.length} record(s) with their recorded hours?`)) return;
    const r = await API.faculty.bulkApprove({ ids });
    toast(`${r.approved} approved${r.skipped ? `, ${r.skipped} skipped (high risk)` : ''}.`, r.skipped ? 'warn' : 'ok', 5000);
    await load();
  });
  try { await load(); } catch (e) { toast(e.message, 'err'); }
})();
