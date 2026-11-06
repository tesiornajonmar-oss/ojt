(async () => {
  const me = await Shell.init('dashboard');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let d;
  try { d = await API.faculty.dashboard(); } catch (e) { return toast(e.message, 'err'); }
  const roster = d.roster, c = d.counts, flagged = roster.filter(r => r.flags.length);
  const avg = roster.length ? Math.round(roster.reduce((a, r) => a + r.pct, 0) / roster.length) : 0;
  const cnt = s => roster.filter(r => r.status === s).length;

  $('welcome').textContent = `Welcome, ${me.name}. ${me.role === 'SUPER_ADMIN' ? 'You are viewing every trainee in the program.' : 'Here is how your trainees are doing.'}`;
  $('sTrainees').textContent = roster.length;
  $('sTraineesSub').textContent = `${cnt('ACTIVE')} active • ${cnt('COMPLETED')} completed`;
  $('sNeeds').textContent = c.needsYou + c.reports;
  $('sNeedsSub').textContent = `${c.needsYou} attendance • ${c.reports} reports`;
  $('sWait').textContent = c.awaiting;
  $('sFlags').textContent = flagged.length;
  $('sAvgSub').textContent = `${avg}% average progress`;

  $('needList').innerHTML = d.needsYou.length || d.reports.length
    ? [...d.needsYou.map(s => `<a class="list-row" href="approvals.html"><div><b>${esc(s.studentName)}</b> — ${U.fmtShortDate(s.date)} • ${s.computed_hours} h
          <div class="small">${riskChip(s.risk)} ${flagChips(s.flags)}</div></div><span class="${s.age_days >= 3 ? 'late' : 'small muted'}">${s.age_days <= 0 ? 'Today' : s.age_days + 'd'}</span></a>`),
       ...d.reports.map(r => `<a class="list-row" href="approvals.html"><div><b>${esc(r.studentName)}</b> — ${esc(r.title)}<div class="small muted">Narrative report</div></div><span class="chev">›</span></a>`)].join('')
    : '<p class="muted">🎉 Nothing needs your review. Clean records are approved automatically.</p>';
  $('attnList').innerHTML = flagged.length ? flagged.slice(0, 6).map(r => `
    <a class="list-row" href="students.html?sid=${encodeURIComponent(r.sid)}"><div><b>${esc(r.name)}</b><div class="small muted">${esc(r.flags.join(' • '))}</div></div><span class="chev">›</span></a>`).join('')
    : '<p class="muted">No trainees are flagged right now.</p>';
})();
