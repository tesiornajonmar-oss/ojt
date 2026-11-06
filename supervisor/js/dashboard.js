(async () => {
  const me = await Shell.init('dashboard');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let d;
  try { d = await API.supervisor.dashboard(); } catch (e) { return toast(e.message, 'err'); }
  const c = d.counts, co = d.company;

  $('welcome').textContent = `Welcome, ${me.name}${co ? ' — ' + co.name : ''}.`;
  $('sTrainees').textContent = c.trainees; $('sAvgSub').textContent = `${c.avg}% average progress`;
  $('sPending').textContent = c.pending; $('sSpot').textContent = c.overtime; $('sDuty').textContent = c.on_duty;
  $('dutyNames').textContent = d.onDuty.map(x => x.name).join(', ');

  const STATE = { ON_DUTY: ['🟢 On duty', 'pill-approved'], DONE: ['✓ Done', 'pill-approved'], NOT_IN: ['⚠ Not clocked in', 'pill-revision'], EXPECTED: ['Expected', 'pill-pending'], OFF: ['Day off', 'pill-pending'] };
  $('boardNote').textContent = `${d.board.filter(b => b.state === 'ON_DUTY' || b.state === 'DONE').length} of ${d.board.length} in today`;
  $('boardList').innerHTML = d.board.length ? d.board.map(b => `<a class="list-row" href="trainees.html?sid=${encodeURIComponent(b.sid)}"><div><b>${esc(b.name)}</b>
      <div class="small muted">${esc(b.section || '')}${b.time_in ? `${b.section ? ' • ' : ''}In ${U.fmtTime(b.time_in)}${b.time_out ? ' – Out ' + U.fmtTime(b.time_out) : ''}` : ''}${b.late ? ' • <span class="late">Late</span>' : ''}</div></div>
      <span class="${STATE[b.state][1]}">${STATE[b.state][0]}</span></a>`).join('') : '<p class="muted">No active trainees.</p>';

  const max = Math.max(1, ...d.week.map(w => w.hours));
  $('weekTotal').textContent = `${+d.week.reduce((a, w) => a + w.hours, 0).toFixed(1)} h total`;
  $('weekChart').innerHTML = d.week.map(w => `<div class="bar-col" title="${esc(U.fmtShortDate(w.date))}: ${w.hours} h"><span class="bar-val">${w.hours || ''}</span>
      <div class="bar" style="height:calc((100% - 34px) * ${(w.hours / max).toFixed(3)})"></div><span class="bar-lab">${esc(U.parseDate(w.date).toLocaleDateString('en-PH', { weekday: 'short' }))}</span></div>`).join('');
  $('evalDue').innerHTML = d.evalDue.length ? `<h4 style="margin-bottom:6px">⭐ Ready for evaluation</h4>` + d.evalDue.map(e => `<a class="list-row" href="evaluations.html"><div><b>${esc(e.name)}</b>
      <div class="small muted">${e.pct}% of hours done</div></div><span class="chev">›</span></a>`).join('') : '';

  $('companyCard').innerHTML = co ? `<div class="card-head-row"><h3 class="left">🏢 ${esc(co.name)}</h3>${moaChip(co.moa_effective)}</div>
      <div class="kv"><span>Address</span><b>${esc(co.address)}</b></div>
      <div class="kv"><span>Geofence</span><b>${co.geofence_radius} m ${co.lat == null ? '<span class="chip chip-warn">no coordinates — ask the faculty to set them</span>' : ''}</b></div>
      <p class="small muted" style="margin-top:10px">Records that wait more than <b>${d.escalate_days} days</b> are escalated to the trainee's faculty adviser automatically.</p>` : '';

  $('oldestList').innerHTML = d.oldest.length ? d.oldest.map(s => `
    <a class="list-row" href="approvals.html"><div><b>${esc(s.studentName)}</b> — ${U.fmtShortDate(s.date)} • ${s.computed_hours} h
      <div class="small">${riskChip(s.risk)} ${flagChips(s.flags)}</div></div><span class="${s.age_days >= d.escalate_days - 1 ? 'late' : 'small muted'}">${s.age_days <= 0 ? 'Today' : s.age_days + 'd'}</span></a>`).join('')
    : '<p class="muted">🎉 Nothing is waiting for you. Clean records are approved automatically.</p>';
  $('attnList').innerHTML = d.attention.length ? d.attention.map(r => `
    <a class="list-row" href="trainees.html?sid=${encodeURIComponent(r.sid)}"><div><b>${esc(r.name)}</b><div class="small muted">${esc(r.flags.join(' • '))}</div></div><span class="chev">›</span></a>`).join('')
    : '<p class="muted">No trainees are flagged right now.</p>';
})();
